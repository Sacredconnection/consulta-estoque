import test from 'node:test';
import assert from 'node:assert/strict';
import {environmentConnections,sacredRetailEnvironment} from '../lib/connections-env';
import {advanceSacred,combineSacredChannels} from '../lib/sacred-catalog';
import {initialCursor} from '../lib/sync-cursor';
import {mergeCatalog,toRecord,wooPage} from '../lib/woo';
import {sacredReplenishment} from '../lib/replenishment';
import {getDatabase,getClient} from '../lib/database';
import {readFile} from 'node:fs/promises';
import {startSynchronization,advanceSynchronization} from '../lib/sync-service';
import {state} from '../lib/server';
import {signedWooUrl} from '../lib/woo-oauth';
import {createHmac} from 'node:crypto';

test('Woo OAuth signs parameters with SHA256 and changes only signature base behind a proxy',async()=>{
 const url=new URL('https://retail.example/wp-json/wc/v3/products?per_page=1&search=For%C3%A7a');
 const credentials={key:'key',secret:'secret'};
 const a=await signedWooUrl(url,credentials,'https:','nonce','123');
 const b=await signedWooUrl(url,credentials,'http:','nonce','123');
 assert.equal(b.protocol,'https:');assert.notEqual(a.searchParams.get('oauth_signature'),b.searchParams.get('oauth_signature'));
 const params='oauth_consumer_key=key&oauth_nonce=nonce&oauth_signature_method=HMAC-SHA256&oauth_timestamp=123&per_page=1&search=For%C3%A7a';
 const expected=createHmac('sha256','secret&').update('GET&'+encodeURIComponent('https://retail.example/wp-json/wc/v3/products')+'&'+encodeURIComponent(params)).digest('base64');
 assert.equal(a.searchParams.get('oauth_signature'),expected);
 await assert.rejects(signedWooUrl(new URL('http://retail.example'),credentials));
});
test('retail tries proxy signature only after a signature mismatch and never sends HTTP',async()=>{
 const urls:URL[]=[];
 const result=await wooPage('sacred',{siteUrl:'https://retail.example',key:'key',secret:'secret'},'products',{},(async input=>{
  urls.push(new URL(String(input)));
  if(urls.length===1)return Response.json({code:'woocommerce_rest_cannot_view'},{status:401});
  if(urls.length===2)return Response.json({code:'woocommerce_rest_authentication_error',message:'Invalid signature - provided signature does not match.'},{status:401});
  return Response.json([{id:1}]);
 }) as typeof fetch);
 assert.equal(result.items.length,1);assert.equal(urls.length,3);assert.ok(urls.every(u=>u.protocol==='https:'&&u.hostname==='retail.example'));
});

const retail={siteUrl:'https://retail.example',key:'retail-key',secret:'retail-secret'};
const credentials={key:'wholesale-key',secret:'wholesale-secret',retail};
test('retail retries missing authentication only on the same HTTPS origin, with redacted failures',async()=>{
 let count=0;
 const request=(async(input,init)=>{
  const url=new URL(String(input));assert.equal(url.origin,retail.siteUrl);assert.equal(init?.redirect,'manual');count++;
  if(count===1)return Response.json({code:'woocommerce_rest_cannot_view'},{status:401});
  assert.equal(url.searchParams.has('consumer_secret'),false);assert.equal(url.searchParams.get('oauth_consumer_key'),retail.key);assert.ok(url.searchParams.get('oauth_signature'));assert.equal(String(input).includes(retail.secret),false);
  assert.equal(url.searchParams.get('per_page'),'1');
  return Response.json([{id:1}]);
 }) as typeof fetch;
 assert.equal((await wooPage('sacred',retail,'products',{per_page:'1'},request)).items.length,1);assert.equal(count,2);
 count=0;
 await assert.rejects(wooPage('sacred',retail,'products',{},(async()=>{count++;if(count===1)return Response.json({code:'woocommerce_rest_cannot_view'},{status:401});throw Error(retail.secret);}) as typeof fetch),error=>error instanceof Error&&!error.message.includes(retail.secret));
 let forbidden=0;await assert.rejects(wooPage('sacred',retail,'products',{},(async()=>{forbidden++;return Response.json({code:'woocommerce_rest_cannot_view'},{status:403});}) as typeof fetch));assert.equal(forbidden,1);
});
test('retail variables attach to Sacred without creating another company',()=>{
 const values={WOO_SACRED_KEY:'key',WOO_SACRED_SECRET:'secret',SACRED_RETAIL_SITE_URL:retail.siteUrl,SACRED_RETAIL_CONSUMER_KEY:retail.key,SACRED_RETAIL_CONSUMER_SECRET:retail.secret};
 assert.deepEqual(environmentConnections(values),[{id:'sacred',key:'key',secret:'secret',retail}]);
 assert.throws(()=>sacredRetailEnvironment({...values,SACRED_RETAIL_CONSUMER_KEY:''}));
 for(const siteUrl of ['http://retail.example','https://retail.example/path','https://backend-wholesale.sacred-snuff.com'])assert.throws(()=>sacredRetailEnvironment({...values,SACRED_RETAIL_SITE_URL:siteUrl}));
});
test('Sacred checkpoints both sources and isolates overlapping Woo IDs',async()=>{
 const calls:string[]=[];
 const request=(async(input:URL|string|Request,init?:RequestInit)=>{
  const url=new URL(String(input));calls.push(url.hostname);
  const isRetail=url.hostname==='retail.example';
  assert.equal(new Headers(init?.headers).get('authorization'),'Basic '+btoa(isRetail?'retail-key:retail-secret':'wholesale-key:wholesale-secret'));
  return Response.json([{id:1,sku:'SKU',name:'Product',manage_stock:true,stock_quantity:isRetail?4:6}],{headers:{'X-WP-Total':'1','X-WP-TotalPages':'1'}});
 }) as typeof fetch;
 const a=await advanceSacred(credentials,{...initialCursor(),sacredSources:retail.siteUrl},request);
 assert.equal(a.done,false);assert.equal(a.cursor.sacredPhase,'retail');
 const b=await advanceSacred(credentials,JSON.parse(JSON.stringify(a.cursor)),request);
 assert.equal(b.done,true);assert.equal(b.cursor.productsDone,2);assert.equal(b.cursor.records,2);
 assert.deepEqual(calls,['backend-wholesale.sacred-snuff.com','retail.example']);
 assert.equal(a.records[0].stocks[0].id,1);assert.equal(b.records[0].stocks[0].id,-1);
 const products=mergeCatalog(combineSacredChannels([...a.records,...b.records]));
 assert.equal(products.length,1);assert.equal(products[0].stocks[0].quantity,10);
 const lines=sacredReplenishment([{sku:'SKU',product:'Product',variation:'',minimum:15}],products);
 assert.equal(lines[0].order,5);
 await assert.rejects(advanceSacred(credentials,{...a.cursor,sacredSources:'https://old.example'},request));
 await assert.rejects(advanceSacred(credentials,a.cursor,(async()=>{throw Error('offline');}) as typeof fetch));
});
test('aggregation preserves unknowns, source duplicates and mismatched weights for review',()=>{
 const a=toRecord('sacred',{id:1,sku:'SKU',name:'Product',manage_stock:true,stock_quantity:6},'2026-09-10');
 const b=structuredClone(a);b.stocks[0]={...b.stocks[0],id:-1,sourceChannel:'retail',quantity:null};
 assert.equal(combineSacredChannels([a,b])[0].stocks[0].quantity,null);
 b.stocks[0].grams=10;
 assert.equal(combineSacredChannels([a,b]).length,2);
 delete b.stocks[0].grams;
 assert.equal(combineSacredChannels([a,a,b]).length,3);
 b.stocks[0].shared=true;
 assert.equal(combineSacredChannels([a,b]).length,2);
});

test('persistent Sacred snapshot publishes only after both channels complete and survives retail failure',async()=>{
 const vars={TURSO_DATABASE_URL:'file::memory:',WOO_SACRED_KEY:'key',WOO_SACRED_SECRET:'secret',SACRED_RETAIL_SITE_URL:retail.siteUrl,SACRED_RETAIL_CONSUMER_KEY:retail.key,SACRED_RETAIL_CONSUMER_SECRET:retail.secret};
 Object.assign(process.env,vars);
 const db=getDatabase(),originalFetch=globalThis.fetch;
 try{
  for(const name of ['0000_free_cerebro','0001_puzzling_goliath','0002_persistent_cache']){
   for(const sql of (await readFile('drizzle/'+name+'.sql','utf8')).split('--> statement-breakpoint').filter(s=>s.trim()))await db.prepare(sql).run();
  }
  let failRetail=false;
  globalThis.fetch=(async(input)=>{
   const isRetail=String(input).includes('retail.example');
   if(isRetail&&failRetail)throw Error('unavailable');
   return Response.json([{id:1,sku:'SKU',name:'Product',manage_stock:true,stock_quantity:isRetail?4:6}]);
  }) as typeof fetch;
  const run=(await startSynchronization({storeId:'sacred'})).connections.find(c=>c.id==='sacred')!.sync!.runId;
  await advanceSynchronization('sacred',run);
  assert.equal((await state()).products.length,0);
  await advanceSynchronization('sacred',run);
  assert.equal((await state()).products[0].stocks[0].quantity,10);
  assert.equal((await startSynchronization({storeId:'sacred'})).cached,true);
  const next=(await startSynchronization({storeId:'sacred',force:true})).connections.find(c=>c.id==='sacred')!.sync!.runId;
  await advanceSynchronization('sacred',next);failRetail=true;
  await advanceSynchronization('sacred',next);
  const saved=await state();
  assert.equal(saved.products[0].stocks[0].quantity,10);
  assert.equal(saved.connections.find(c=>c.id==='sacred')!.sync!.status,'failed');
  process.env.SACRED_RETAIL_SITE_URL='https://new-retail.example';
  assert.equal((await state()).connections.find(c=>c.id==='sacred')!.needsSync,true);
  const replacement=await startSynchronization({storeId:'sacred'});
  assert.equal(replacement.connections.find(c=>c.id==='sacred')!.sync!.status,'running');
 }finally{globalThis.fetch=originalFetch;getClient().close();for(const key of Object.keys(vars))delete process.env[key];}
});
