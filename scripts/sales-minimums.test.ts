import test from 'node:test';
import assert from 'node:assert/strict';
import {buildSalesMinimums,type SalesOrder} from '../lib/sales-minimums';
import {toRecord,wooPage} from '../lib/woo';
import {environmentConnections,retailEnvironment} from '../lib/connections-env';
import {advanceStoreChannels,combineSacredChannels} from '../lib/sacred-catalog';
import {initialCursor} from '../lib/sync-cursor';

const product=toRecord('maya',{id:1,sku:'0012-10',name:'Product',manage_stock:true,stock_quantity:4},'now');
const order=(id:string,status:string,quantity:number):SalesOrder=>({id,status,date:'2026-09-01',lines:[{sku:'0012-10',quantity,product:'Product'}]});
test('sales combine retail and confirmed manual orders, deduplicate sheet mirrors and exclude unpaid/freight',()=>{
 const retail=[order('1','completed',8),order('2','processing',4),order('3','pending',99),order('4','refunded',99)];
 const sheet=[{...order('erp1','WooCommerce',8),reference:'Webshop order #1'},order('erp2','Afgerond / Factureren',4),order('erp3','Proforma / Wachten op betaling',99),{...order('erp4','WooCommerce',99),reference:'Weborder #999'},order('erp5','Gereed voor Picken',4)];
 sheet[1].lines.push({sku:'SHIP-EU',product:'Shipping',quantity:1});
 const result=buildSalesMinimums(retail,sheet,[product],8);
 assert.equal(result.items.length,1);assert.equal(result.items[0].sku,'0012-10');assert.equal(result.items[0].sold,20);assert.equal(result.items[0].minimum,8);
 assert.equal(result.audit.sheetMirrors,1);assert.equal(result.audit.sheetUnverifiedMirrors,1);assert.equal(result.audit.shippingLines,1);
 assert.throws(()=>buildSalesMinimums([retail[0],retail[0]],[],[product],8));
 assert.throws(()=>buildSalesMinimums([],[],[],0));
});
test('unmatched SKUs are audited rather than merged with a different presentation',()=>{
 const o=order('1','completed',1);o.lines[0].sku='0012-100';
 const result=buildSalesMinimums([o],[],[product],12);
 assert.equal(result.items.length,0);assert.equal(result.unmatched[0].sku,'0012-100');
 assert.equal(buildSalesMinimums([order('2','completed',16)],[],[product],12).items[0].minimum,4);
});
test('Maya retail is configured independently, validates URLs and preserves Sacred',()=>{
 const connections=environmentConnections({WOO_MAYA_KEY:'a',WOO_MAYA_SECRET:'b',MAYA_RETAIL_SITE_URL:'https://retail.example',MAYA_RETAIL_CONSUMER_KEY:'c',MAYA_RETAIL_CONSUMER_SECRET:'d',WOO_SACRED_KEY:'s',WOO_SACRED_SECRET:'t'});
 assert.equal(connections.find(c=>c.id==='maya')?.retail?.siteUrl,'https://retail.example');
 assert.equal(connections.find(c=>c.id==='sacred')?.retail,undefined);
 assert.throws(()=>retailEnvironment({MAYA_RETAIL_SITE_URL:'https://backend-wholesale.mayaherbs.com',MAYA_RETAIL_CONSUMER_KEY:'c',MAYA_RETAIL_CONSUMER_SECRET:'d'},'maya'));
});
test('Maya publishes both sources as one stock, without cross-store collisions or summing mirrored balances',async()=>{
 const credentials={key:'a',secret:'b',retail:{siteUrl:'https://retail.example',key:'c',secret:'d'}};
 const request=(async(input:URL|string|Request)=>{
  const url=new URL(String(input));assert.equal(url.searchParams.get('lang'),'en');
  return Response.json([{id:1,sku:'SKU',name:'Product',manage_stock:true,stock_quantity:url.hostname==='retail.example'?8:0}]);
 }) as typeof fetch;
 const a=await advanceStoreChannels('maya',credentials,{...initialCursor(),sacredSources:credentials.retail.siteUrl},request);
 assert.equal(a.done,false);
 const b=await advanceStoreChannels('maya',credentials,a.cursor,request);assert.equal(b.done,true);
 assert.equal(b.records[0].stocks[0].id,-1);
 const sacred=toRecord('sacred',{id:1,sku:'SKU',name:'Sacred',manage_stock:true,stock_quantity:40},'now');
 const records=combineSacredChannels([...a.records,...b.records,sacred]);
 assert.equal(records.length,2);assert.equal(records.find(p=>p.stocks[0].storeId==='maya')?.stocks[0].quantity,0);
 a.records[0].stocks[0].quantity=null;
 assert.equal(combineSacredChannels([...a.records,...b.records])[0].stocks[0].quantity,8);
 await assert.rejects(advanceStoreChannels('maya',credentials,{...a.cursor,sacredSources:'old'},request));
 await assert.rejects(advanceStoreChannels('maya',credentials,a.cursor,(async()=>{throw Error('offline');}) as typeof fetch));
});
test('Maya retail redirects do not forward credentials',async()=>{
 await assert.rejects(wooPage('maya',{siteUrl:'https://retail.example',key:'a',secret:'b'},'products',{},(async(input,init)=>{
  assert.equal(new URL(String(input)).hostname,'retail.example');assert.equal(init?.redirect,'manual');
  return new Response(null,{status:302,headers:{Location:'https://other.example'}});
 }) as typeof fetch));
});
