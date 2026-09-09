import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePagnierRows, advancePagnier } from '../lib/pagnier';
import { buildStockRows, totalMass } from '../lib/stock-table';
import { agentAnswer, DEFAULT_RULE } from '../lib/inventory';
import { initialCursor } from '../lib/sync-cursor';

const names=['Código do produto','Revisão do produto','Descrição do produto','Unidade de medida abreviatura','Código da empresa','Nome da empresa','Código do setor de estoque','Nome do setor de estoque','Setor de estoque ativo?','Setor de estoque considera saldo disponível?','Saldo em estoque do produto no setor','Tipo de produto','Grupo de produto','Família de produto','Produto ativo?','Peso líquido unitário (kg)'];
const columns=names.map((name,i)=>({name,id:String(100+i)}));
const sample:Record<string,string|null>={'Código do produto':'TSUNU','Revisão do produto':'0','Descrição do produto':'Tsunu 250g','Unidade de medida abreviatura':'UNID','Código da empresa':'01','Nome da empresa':'Empresa','Código do setor de estoque':'10','Nome do setor de estoque':'Expedição','Setor de estoque ativo?':'Sim','Setor de estoque considera saldo disponível?':'Sim','Saldo em estoque do produto no setor':'4','Tipo de produto':'Produto acabado','Grupo de produto':'Rapé','Família de produto':'Tsunu','Produto ativo?':'Sim','Peso líquido unitário (kg)':'0.25'};
const row=(overrides:Record<string,string|null>={})=>names.map(name=>[({...sample,...overrides})[name]]);

test('Pagnier sums distinct available sectors, not repeated company balances, and is searchable',()=>{
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
