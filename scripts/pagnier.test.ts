import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePagnierRows, advancePagnier } from '../lib/pagnier';
import { buildStockRows, totalMass } from '../lib/stock-table';
import { agentAnswer, DEFAULT_RULE, searchProducts } from '../lib/inventory';
import { initialCursor } from '../lib/sync-cursor';
import type { Product } from '../lib/inventory';

test('equivalent Maya and Sacred SKUs share one presentation and remain searchable by either code',()=>{
 const make=(storeId:'maya'|'sacred'|'pagnier',sku:string,grams:number,id:number,quantity:number):Product=>({key:'sku:'+sku,sku,name:storeId==='maya'?'Yawanawa Força Feminina':'Yawanawa Feminine Force Rapeh',category:'Rapé',stocks:[{storeId,id,quantity,grams,packaging:grams<=50?'can':'bulk',status:'instock',updatedAt:'now'}]});
 const products=[make('maya','RAYA02-10',10,1,109),make('sacred','RAYA0204',10,2,-42),make('pagnier','RAYA0204',10,3,5),make('maya','RAYA02-50',50,4,2),make('sacred','RAYA0206',50,5,3)];
 const rows=buildStockRows(products);assert.equal(rows.length,2);
 const ten=rows.find(r=>r.sku==='RAYA02-10')!;
 assert.equal(ten.stores.maya?.quantity,109);assert.equal(ten.stores.sacred?.quantity,-42);assert.equal(ten.stores.pagnier?.quantity,5);
 assert.deepEqual(ten.stores.sacred?.skus,['RAYA0204']);
 assert.equal(totalMass(Object.values(ten.stores)).kg,1.1400000000000001);
 for(const code of ['RAYA02-10','RAYA0204']){
  const result=agentAnswer(products,DEFAULT_RULE,'estoque de '+code,['maya','sacred','pagnier']);
  assert.equal(result.products.length,3);assert.equal(buildStockRows(result.products).length,1);
 }
 assert.ok(ten.search.includes('raya0204'));
});

test('family queries include all presentations even when an exact parent SKU exists',()=>{
 for(const family of ['RAYA02','RACO06','RASC01']){
  let id=0;
  const make=(storeId:'maya'|'sacred'|'pagnier',sku:string,grams:number|null):Product=>({key:storeId+sku,sku,name:'Rapé',category:'Rapé',stocks:[{storeId,id:++id,quantity:2,grams,status:'instock',updatedAt:'now'}]});
  const parent=make('sacred',family,null);parent.stocks[0].shared=true;
  const variants=[[5,'09'],[10,'04'],[20,'05'],[50,'06'],[100,'03'],[250,'02'],[500,'01']] as const;
  const products=[parent,...variants.flatMap(([grams,suffix])=>[make('maya',family+'-'+grams,grams),make('sacred',family+suffix,grams)])];
  const bulk=make('pagnier',family+'00',1000);bulk.stocks[0].quantityUnit='kg';products.push(bulk);
  const unrelated=make('maya','RAXX99-10',10);
  for(const query of [family.toLowerCase(),'estoque de '+family]){
   const result=agentAnswer([...products,unrelated],DEFAULT_RULE,query,['maya','sacred','pagnier']);
   assert.deepEqual(result.products,products);
   assert.equal(buildStockRows(result.products).length,9);
  }
  for(const code of [family+'-10',family+'04']){
   const result=searchProducts(products,code);
   assert.equal(result.length,2);
   assert.equal(buildStockRows(result)[0].sku,family+'-10');
  }
  const scoped=agentAnswer(products,DEFAULT_RULE,family+' na maya',['maya','sacred','pagnier']);
  assert.equal(scoped.products.length,7);
  assert.ok(scoped.products.every(p=>p.stocks.every(s=>s.storeId==='maya')));
 }
});

test('equivalence keeps different weights, shared pools and unrelated SKU patterns separate',()=>{
 const make=(sku:string,grams:number,shared=false):Product=>({key:sku,sku,name:'Same name',category:'Rapé',stocks:[{storeId:'sacred',id:grams,quantity:1,grams,shared,packaging:'can',status:'instock',updatedAt:'now'}]});
 const rows=buildStockRows([make('RAYA0204',10),make('RAYA0206',50),make('RAYA02',50,true),make('OTHER0206',50)]);
 assert.equal(rows.length,4);
 assert.equal(rows.filter(r=>r.key.startsWith('equivalent:')).length,2);
});

test('all rapé families and presentations use actual weight, including different suffix conventions',()=>{
 const make=(storeId:'maya'|'sacred'|'pagnier',sku:string,grams:number|null,id:number):Product=>({key:storeId+sku,sku,name:storeId==='maya'?'Nome em português':'English name',category:'Rapé',stocks:[{storeId,id,quantity:2,grams,packaging:'can',status:'instock',updatedAt:'now'}]});
 for(const family of ['RACO06','RAHK02','RANU10','RAKU21','RAYA02','RAZZ99']){
  for(const [grams,suffix] of [[5,'09'],[10,'04'],[20,'05'],[50,'06'],[100,'03'],[250,'02'],[500,'01']] as const){
   const products=[make('maya',family+'-'+grams,grams,1),make('sacred',family+suffix,grams,2),make('pagnier',family+suffix,grams,3)];
   const rows=buildStockRows(products);assert.equal(rows.length,1);assert.equal(Object.keys(rows[0].stores).length,3);
   assert.ok(Math.abs(totalMass(Object.values(rows[0].stores)).kg!-6*grams/1000)<1e-9);
   for(const query of [family+'-'+grams,family+suffix,'Nome em português','English name'])assert.equal(searchProducts(products,query).length,3);
  }
 }
 const differentSuffixes=[make('maya','RASC01-10',10,1),make('sacred','RASC0103',10,2),make('maya','RASC01-50',50,3),make('sacred','RASC0105',50,4)];
 assert.equal(buildStockRows(differentSuffixes).length,2);
 assert.equal(searchProducts(differentSuffixes,'RASC0103').length,2);
 assert.equal(buildStockRows(searchProducts(differentSuffixes,'RASC01-50'))[0].stores.sacred?.quantity,2);
 const hundred=make('pagnier','RASC0111',100,5);
 assert.equal(searchProducts([...differentSuffixes,hundred],'RASC01-10').length,2);
 // A source can assign the same variant ID to a different presentation.
 const pagnierHundred=make('pagnier','RASC0103',100,6);
 const mixed=[...differentSuffixes,pagnierHundred];
 assert.equal(buildStockRows(searchProducts(mixed,'RASC0103')).length,2);
 assert.equal(buildStockRows(searchProducts(mixed,'RASC01-10')).length,1);
 const invalid=[make('maya','RAYA14-500',10,1),make('sacred','RAYA1404',10,2),make('maya','RAYA14-10',null,3),make('sacred','RAYA1504',10,4)];
 assert.equal(buildStockRows(invalid).length,4);
 assert.equal(searchProducts(invalid,'RAYA14-500').length,1);
 const bulk=make('pagnier','RACO0600',1000,5);bulk.stocks[0].quantityUnit='kg';
 const units=make('maya','RACO06-1000',1000,6);
 assert.equal(buildStockRows([bulk,units]).length,2);
});

const names=['Código do produto','Revisão do produto','Descrição do produto','Unidade de medida abreviatura','Código da empresa','Nome da empresa','Código do setor de estoque','Nome do setor de estoque','Setor de estoque ativo?','Setor de estoque considera saldo disponível?','Saldo em estoque do produto no setor','Tipo de produto','Grupo de produto','Família de produto','Produto ativo?','Peso líquido unitário (kg)'];
const columns=names.map((name,i)=>({name,id:String(100+i)}));
const sample:Record<string,string|null>={'Código do produto':'TSUNU','Revisão do produto':'0','Descrição do produto':'Tsunu 250g','Unidade de medida abreviatura':'UNID','Código da empresa':'01','Nome da empresa':'Empresa','Código do setor de estoque':'10','Nome do setor de estoque':'Expedição','Setor de estoque ativo?':'Sim','Setor de estoque considera saldo disponível?':'Sim','Saldo em estoque do produto no setor':'4','Tipo de produto':'Produto acabado','Grupo de produto':'Rapé','Família de produto':'Tsunu','Produto ativo?':'Sim','Peso líquido unitário (kg)':'0.25'};
const row=(overrides:Record<string,string|null>={})=>names.map(name=>[({...sample,...overrides})[name]]);

test('Pagnier sums distinct available sectors, not repeated company balances, and is searchable',()=>{
 assert.equal(parsePagnierRows([row({'Descrição do produto':'ETIQUETA Tsunu 250g'})],columns,'now').length,0);
 const products=parsePagnierRows([row(),row({'Código do setor de estoque':'11','Saldo em estoque do produto no setor':'8'}),row({'Setor de estoque considera saldo disponível?':'Não'})],columns,'now');
 assert.equal(products.length,2);const cells=buildStockRows(products);assert.equal(cells.length,1);
 assert.equal(cells[0].stores.pagnier?.quantity,12);assert.equal(cells[0].stores.pagnier?.kg,3);
 const answer=agentAnswer(products,DEFAULT_RULE,'estoque de Tsunu',['pagnier','maya']);
 assert.equal(answer.products.length,2);assert.match(answer.text,/Pagnier/);
});

test('kg balances stay kg, unknown quantities remain unknown, and weights exclude packaging',()=>{
 const products=parsePagnierRows([row({'Unidade de medida abreviatura':'KG','Saldo em estoque do produto no setor':'1.18','Peso líquido unitário (kg)':null})],columns,'now');
 const cell=buildStockRows(products)[0].stores.pagnier!;
 assert.equal(cell.unit,'kg');assert.equal(cell.quantity,1.18);assert.equal(cell.kg,1.18);
 const unknown=parsePagnierRows([row({'Saldo em estoque do produto no setor':null})],columns,'now');
 assert.equal(buildStockRows(unknown)[0].stores.pagnier?.kg,null);
 const packaging=parsePagnierRows([row({'Tipo de produto':'Embalagem'})],columns,'now');
 assert.equal(packaging[0].stocks[0].grams,null);
});

test('table totals include cans separately from bulk and do not double-count shared pools',()=>{
 const base=parsePagnierRows([row()],columns,'now')[0];
 const stocks=[{...base.stocks[0],id:1,quantity:109,grams:10,packaging:'can' as const},{...base.stocks[0],id:2,quantity:21,grams:250},{...base.stocks[0],id:3,quantity:9,grams:500},{...base.stocks[0],id:4,quantity:null,grams:50,packaging:'can' as const}];
 const cell=buildStockRows([{...base,stocks}])[0].stores.pagnier!;
 assert.ok(Math.abs(cell.kg!-10.84)<1e-9);assert.equal(cell.bulkKg,9.75);assert.equal(cell.partial,true);
 const pool={...stocks[0],id:5,parentId:100,shared:true};
 const shared=buildStockRows([{...base,stocks:[pool,{...pool,id:6}]}])[0].stores.pagnier!;
 assert.equal(shared.quantity,109);assert.equal(shared.kg,null);
 assert.equal(totalMass([cell,shared]).partial,true);
});

test('Pagnier pagination validates all pages and fails without publishing incomplete data',async()=>{
 const cursor=initialCursor();let calls=0;
 const request=(async(_url:unknown,init?:RequestInit)=>{
  calls++;
  if(calls===1)return Response.json({colHead:columns.map(c=>[c.id,'',c.name]),new_grid:['','','','','','123'],dataText:[],navigInfo:[1,200,201]});
  const start=calls===2?1:201;assert.match(String(init?.body),new RegExp("RECORDSTART='"+start+"'"));
  return Response.json({navigInfo:[start,200,201],grid_param:{dataColOrder:columns.map(c=>c.id)},dataText:Array.from({length:start===1?200:1},(_,i)=>row({'Código do produto':'SKU'+(start+i)}))});
 }) as typeof fetch;
 const first=await advancePagnier(cursor,request);assert.equal(first.done,false);assert.equal(first.records.length,200);assert.equal(cursor.productsDone,0);
 const last=await advancePagnier(first.cursor,request);assert.equal(last.done,true);assert.equal(last.cursor.productsDone,201);
 await assert.rejects(advancePagnier(first.cursor,(async()=>Response.json({navigInfo:[201,200,201],grid_param:{dataColOrder:columns.map(c=>c.id)},dataText:[]})) as typeof fetch),/incompletos/);
 assert.throws(()=>parsePagnierRows([row()],columns.slice(1),'now'),/formato/);
});
