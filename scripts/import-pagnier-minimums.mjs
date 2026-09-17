import ExcelJS from 'exceljs';
import {createClient} from '@libsql/client';
import {mkdir, writeFile} from 'node:fs/promises';

const source='ESTOQUIE PAGNIER MINIMO E MAXIMO.xlsx';
const workbook=new ExcelJS.Workbook();
await workbook.xlsx.readFile(source);
const sheet=workbook.worksheets[0];
if(sheet.getRow(1).getCell(1).text!=='Código do produto'||sheet.getRow(1).getCell(3).text!=='Minimo')throw Error('Cabeçalhos inesperados');
const items=[],skipped=[],seen=new Set();
sheet.eachRow((row,n)=>{
 if(n===1)return;
 const sku=row.getCell(1).text.trim().toUpperCase(),product=row.getCell(2).text.trim();
 if(!sku){if(product)throw Error(`SKU ausente na linha ${n}`);return;}
 if(seen.has(sku))throw Error(`SKU duplicado: ${sku}`);
 seen.add(sku);
 const minimum=row.getCell(3).value,maximum=row.getCell(4).value;
 if(minimum===null){skipped.push({sku,reason:'Mínimo não preenchido'});return;}
 if(!product||typeof minimum!=='number'||!Number.isFinite(minimum)||minimum<0||typeof maximum!=='number'||!Number.isFinite(maximum)||maximum<minimum)throw Error(`Valores inválidos na linha ${n}`);
 const unit=/\bkg$/i.test(product)?'kg':/\bL$/i.test(product)?'L':null;
 if(!unit)throw Error(`Unidade desconhecida: ${sku}`);
 items.push({sku,product,variation:unit,minimum,maximum,unit});
});
if(!items.length)throw Error('Planilha vazia');
const db=createClient({url:process.env.TURSO_DATABASE_URL,authToken:process.env.TURSO_AUTH_TOKEN});
try{
 const existing=await db.execute({sql:'SELECT payload FROM settings WHERE id=?',args:['pagnier_minimums']});
 const catalog=await db.execute({sql:'SELECT r.payload FROM records r JOIN connections c ON c.id=r.store_id AND c.snapshot=r.snapshot WHERE r.store_id=?',args:['pagnier']});
 const products=catalog.rows.map(r=>JSON.parse(r.payload));
 if(!products.length)throw Error('Catálogo Pagnier indisponível');
 const skus=new Set(products.map(p=>p.sku.trim().toUpperCase()));
 const unmatched=items.filter(i=>!skus.has(i.sku)).map(i=>i.sku);
 const units={};for(const p of products)for(const s of p.stocks??[])units[s.quantityUnit??'un.']=(units[s.quantityUnit??'un.']??0)+1;
 const data={storeId:'pagnier',source,items,skipped,importedAt:new Date().toISOString()};
 await mkdir('work',{recursive:true});
 await writeFile('work/pagnier-minimums-audit.json',JSON.stringify({...data,unmatched,catalogUnits:units},null,2));
 console.log(JSON.stringify({items:items.length,skipped,unmatched,catalogUnits:units,existing:!!existing.rows.length}));
 if(process.argv.includes('--save')){
  if(existing.rows.length)await writeFile(`work/pagnier-minimums-backup-${Date.now()}.json`,existing.rows[0].payload,{flag:'wx'});
  await db.execute({sql:'INSERT INTO settings (id,payload) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload',args:['pagnier_minimums',JSON.stringify(data)]});
  const result=await db.execute({sql:'SELECT payload FROM settings WHERE id=?',args:['pagnier_minimums']});
  if(result.rows[0]?.payload!==JSON.stringify(data))throw Error('Falha na verificação');
  console.log(`Mínimos Pagnier gravados e verificados: ${items.length}`);
 }
}finally{db.close();}
