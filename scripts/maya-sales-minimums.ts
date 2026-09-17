import ExcelJS from 'exceljs';
import {createClient} from '@libsql/client';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {retailEnvironment} from '../lib/connections-env';
import {advanceCatalog,initialCursor} from '../lib/sync-cursor';
import {combineSacredChannels} from '../lib/sacred-catalog';
import {signedWooUrl} from '../lib/woo-oauth';
import type {Product} from '../lib/inventory';
import {buildSalesMinimums,type SalesOrder,type SaleLine} from '../lib/sales-minimums';

const source='order_export_01-01-2026_17-09-2026.xlsx';
const start='2026-01-01T00:00:00',end='2026-09-17T23:59:59';
const months=8+17/30; // eight full calendar months + 17 days of September.
const credentials=retailEnvironment(process.env,'maya');
if(!credentials)throw Error('Configure o varejo Maya');
async function api(path:string,params:Record<string,string>={}){
 const url=new URL('/wp-json/wc/v3/'+path,credentials!.siteUrl);
 for(const [k,v] of Object.entries(params))url.searchParams.set(k,v);
 let response=await fetch(url,{headers:{Authorization:'Basic '+Buffer.from(credentials!.key+':'+credentials!.secret).toString('base64')},redirect:'manual',signal:AbortSignal.timeout(30000)});
 if(response.status===401)for(const scheme of ['https:','http:'] as const){
  response=await fetch(await signedWooUrl(url,credentials!,scheme),{redirect:'manual',signal:AbortSignal.timeout(30000)});
  if(response.status!==401)break;
  const e=await response.clone().json();if(!String(e.message).toLowerCase().includes('invalid signature'))break;
 }
 if(!response.ok)throw Error(`Maya API: HTTP ${response.status}`);
 return {data:await response.json(),pages:Number(response.headers.get('x-wp-totalpages'))};
}
const file='work/maya-sales-source.json';
await mkdir('work',{recursive:true});
if(process.argv.includes('--collect')){
 const orders:SalesOrder[]=[];const seen=new Set<number>();
 for(let page=1;page<=200;page++){
  const result=await api('orders',{after:start,before:end,per_page:'100',page:String(page),orderby:'id',order:'asc',_fields:'id,number,status,date_created,line_items,refunds'});
  if(!Array.isArray(result.data))throw Error('Lista de pedidos inválida');
  for(const o of result.data){
   if(seen.has(o.id))throw Error('Pedido duplicado na paginação');seen.add(o.id);
   const refunds:Map<number,number>=new Map();
   if(['completed','processing'].includes(o.status)&&o.refunds?.length){
    for(const refund of o.refunds){
     const {data}=await api(`orders/${o.id}/refunds/${refund.id}`,{_fields:'id,line_items'});
     for(const line of data.line_items??[]){
      const original=line.meta_data?.find((m:{key:string})=>m.key==='_refunded_item_id')?.value;
      if(!original&&line.quantity)throw Error(`Reembolso sem linha de origem: ${o.id}`);
      refunds.set(Number(original),(refunds.get(Number(original))??0)+Math.abs(Number(line.quantity??0)));
     }
    }
   }
   orders.push({id:String(o.id),number:String(o.number),status:o.status,date:o.date_created,lines:o.line_items.map((l:any)=>({sku:String(l.sku??''),product:String(l.name??''),quantity:Number(l.quantity)-Math.min(Number(l.quantity),refunds.get(l.id)??0)}))});
  }
  console.log(`Pedidos Maya: ${orders.length}`);
  if(page>=result.pages||result.data.length<100)break;
  if(page===200)throw Error('Limite de pedidos excedido');
 }
 await writeFile(file,JSON.stringify({start,end,months,orders,collectedAt:new Date().toISOString()}));
}
if(process.argv.includes('--catalog')){
 let cursor=initialCursor();const records:Product[]=[];
 for(let step=0;step<2000;step++){
  const result=await advanceCatalog('maya',credentials,cursor);cursor=result.cursor;
  records.push(...result.records.map(p=>({...p,stocks:p.stocks.map(s=>({...s,id:-s.id,parentId:s.parentId===undefined?undefined:-s.parentId,sourceChannel:'retail' as const}))})));
  if(step%10===0||result.done)console.log(`Catálogo varejo Maya: ${cursor.productsDone}/${cursor.totalProducts}, ${records.length} registros`);
  if(result.done){await writeFile('work/maya-retail-catalog.json',JSON.stringify({siteUrl:credentials.siteUrl,records,collectedAt:new Date().toISOString()}));break;}
  if(step===1999)throw Error('Limite do catálogo excedido');
 }
}
if(process.argv.includes('--calculate')||process.argv.includes('--save')){
 const sales=JSON.parse(await readFile(file,'utf8'));
 if(sales.start!==start||sales.end!==end)throw Error('Período incompatível');
 const retail=JSON.parse(await readFile('work/maya-retail-catalog.json','utf8'));
 if(retail.siteUrl!==credentials.siteUrl)throw Error('Catálogo de outra origem');
 const w=new ExcelJS.Workbook();await w.xlsx.readFile(source);
 const sheet=w.worksheets[0],sheetOrders=new Map<string,SalesOrder>();
 if(sheet.getRow(1).getCell(20).text!=='Item No.'||sheet.getRow(1).getCell(22).text!=='Quantity')throw Error('Colunas inesperadas');
 sheet.eachRow((r,n)=>{
  if(n===1)return;
  const id=r.getCell(1).text.trim();if(!id)throw Error(`Pedido ausente na linha ${n}`);
  const date=r.getCell(10).text.split('-').reverse().join('-');
  const status=r.getCell(12).text,reference=r.getCell(13).text;
  const o=sheetOrders.get(id)??{id,status,date,reference,lines:[]};
  if(o.status!==status||o.date!==date)throw Error('Pedido inconsistente na planilha');
  const line:SaleLine={sku:r.getCell(20).text.trim(),product:r.getCell(21).text.trim(),quantity:Number(r.getCell(22).value)};
  if(line.sku)o.lines.push(line);sheetOrders.set(id,o);
 });
 const db=createClient({url:process.env.TURSO_DATABASE_URL!,authToken:process.env.TURSO_AUTH_TOKEN});
 try{
  const rows=await db.execute({sql:'SELECT r.payload FROM records r JOIN connections c ON r.store_id=c.id AND r.snapshot=c.snapshot WHERE r.store_id=?',args:['maya']});
  const wholesale:Product[]=rows.rows.map(r=>JSON.parse(String(r.payload))).filter(p=>p.stocks[0].sourceChannel!=='retail');
  if(!wholesale.length)throw Error('Catálogo atacado Maya indisponível');
  const catalog=combineSacredChannels([...wholesale,...retail.records]);
  const result=buildSalesMinimums(sales.orders,[...sheetOrders.values()],catalog,months);
  const wholesaleSkus=new Set(wholesale.map(p=>p.sku.trim().toUpperCase()));
  const retailOnly=result.items.filter(i=>!wholesaleSkus.has(i.sku)).length;
  const data={storeId:'maya',source:`Maya: ${source} + Woo varejo; 01/01–17/09/2026; cobertura de 3 meses`,...result,start,end,months,coverageMonths:3,importedAt:new Date().toISOString(),retailCollectedAt:sales.collectedAt,catalogCollectedAt:retail.collectedAt};
  await writeFile('work/maya-minimums.json',JSON.stringify(data,null,2));
  const report=new ExcelJS.Workbook();
  const minimumSheet=report.addWorksheet('Minimos Maya');
  minimumSheet.addRow(['SKU','Produto','Variacao','Vendas varejo','Vendas planilha adicionais','Total vendido','Media mensal','Minimo 3 meses']);
  for(const item of result.items)minimumSheet.addRow([item.sku,item.product,item.variation,item.soldRetail,item.soldSheet,item.sold,item.monthlyAverage,item.minimum]);
  const missing=report.addWorksheet('SKUs para conferir');missing.addRow(['SKU','Produto','Vendas varejo','Vendas planilha']);
  for(const item of result.unmatched)missing.addRow([item.sku,item.product,item.retail,item.sheet]);
  const notes=report.addWorksheet('Metodo');notes.addRows([
   ['Periodo',start,end],['Meses observados',months],['Cobertura em meses',3],['Formula','ceil(vendido / meses observados * 3)'],
   ['Estoque','Atacado prioritario; varejo quando saldo atacado desconhecido. Nao somar estoques espelhados.'],
   ['Vendas','Woo completed/processing, liquidas das quantidades reembolsadas; planilha concluida/pronta para separacao.'],
   ['Limite da fonte','A planilha nao comprova um historico completo de vendas manuais; somente pedidos presentes e confirmados foram incluidos.'],
   ['SKUs exclusivos varejo',retailOnly],...Object.entries(result.audit),
  ]);
  for(const ws of report.worksheets){ws.getRow(1).font={bold:true};ws.columns.forEach((col,i)=>col.width=i===1?65:22);}
  await mkdir('outputs',{recursive:true});await report.xlsx.writeFile('outputs/Maya_Estoque_Minimo_3meses_2026.xlsx');
  console.log(JSON.stringify({items:result.items.length,retailOnly,audit:result.audit,unmatched:result.unmatched.length}));
  if(process.argv.includes('--save')){
   if(!result.items.length)throw Error('Nenhum mínimo calculado');
   const old=await db.execute({sql:'SELECT payload FROM settings WHERE id=?',args:['maya_minimums']});
   if(old.rows.length)await writeFile(`work/maya-minimums-backup-${Date.now()}.json`,String(old.rows[0].payload),{flag:'wx'});
   await db.execute({sql:'INSERT INTO settings (id,payload) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload',args:['maya_minimums',JSON.stringify(data)]});
   const saved=await db.execute({sql:'SELECT payload FROM settings WHERE id=?',args:['maya_minimums']});
   if(saved.rows[0].payload!==JSON.stringify(data))throw Error('Verificação da gravação falhou');
   console.log(`Mínimos Maya gravados e verificados: ${result.items.length}`);
  }
 }finally{db.close();}
}
