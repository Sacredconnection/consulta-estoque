import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync,type SQLInputValue} from 'node:sqlite';
import {track17Batch,trackingKey,track17Carrier,parseTrack17Result} from '../lib/tracking-17track';
import {carrierReady} from '../lib/tracking-carriers';
import {refreshTracking,readTracking,type TrackingState,type TrackedShipment} from '../lib/tracking-service';
import {setTestDatabase} from './test-database';
import type {InventoryDatabase} from '../lib/database';

const fedex={carrier:'FedEx',tracking:'123456789012',collected:'2026-09-10'};
const info=(status='InTransit')=>({latest_status:{status},latest_event:{description:'On the way',location:'CAMPINAS',time_utc:'2026-09-14T10:00:00Z'},time_metrics:{estimated_delivery_date:{source:'Official',from:'2026-09-16',to:'2026-09-18'}},tracking:{providers:[{latest_sync_time:'2026-09-15T08:00:00Z'}]}});
const response=(accepted:object[]=[],rejected:object[]=[])=>Response.json({code:0,data:{accepted,rejected}});
async function mockFetch(fn:typeof fetch,run:()=>Promise<void>){
 const original=globalThis.fetch,key=process.env.TRACK17_API_KEY;
 globalThis.fetch=fn;process.env.TRACK17_API_KEY='test-secret-never-log';
 try{await run();}finally{globalThis.fetch=original;if(key===undefined)delete process.env.TRACK17_API_KEY;else process.env.TRACK17_API_KEY=key;}
}
test('maps explicit carriers and separates query time from provider event time',()=>{
 assert.equal(track17Carrier(fedex),100003);assert.equal(track17Carrier({carrier:'DHL',tracking:'JVGL123456789012'}),100047);
 assert.equal(track17Carrier({carrier:'Unknown',tracking:'123456789012'}),null);
 const result=parseTrack17Result(info())!;assert.equal(result.status,'Em trânsito');assert.equal(result.expectedDelivery,'2026-09-18');assert.equal(result.expectedDeliveryFrom,'2026-09-16');
 assert.equal(result.eventAt,'2026-09-14T10:00:00Z');assert.equal(result.carrierSyncedAt,'2026-09-15T08:00:00Z');assert.equal(result.source,'17TRACK');
 assert.equal(parseTrack17Result({latest_status:{status:'Delivered'},time_metrics:{estimated_delivery_date:{to:'garbage'}}})?.expectedDelivery,null);
 assert.equal(parseTrack17Result({latest_status:{status:'new-unrecognized-code'}}),null);
});
test('queries existing subscriptions once, deduplicates and sends only number/carrier',async()=>{
 let calls=0;
 await mockFetch(async(url,init)=>{
  calls++;assert.equal(String(url),'https://api.17track.net/track/v2.4/gettrackinfo');
  assert.equal(new Headers(init?.headers).get('17token'),'test-secret-never-log');
  assert.deepEqual(JSON.parse(String(init?.body)),[{number:fedex.tracking,carrier:100003}]);
  return response([{number:fedex.tracking,carrier:100003,track_info:info('Delivered')}]);
 },async()=>{
  assert.equal(carrierReady('USPS'),true);
  const result=await track17Batch([fedex,fedex]);assert.equal(calls,1);assert.equal(result.size,1);assert.equal(result.get(trackingKey(fedex))?.result?.status,'Entregue');
 });
});
test('registers only unregistered numbers and reports pending, never fabricated delivery',async()=>{
 let calls=0;
 await mockFetch(async(url,init)=>{
  calls++;
  if(String(url).endsWith('/gettrackinfo'))return response([],[{number:fedex.tracking,carrier:0,error:{code:-18019902}}]);
  assert.equal(String(url),'https://api.17track.net/track/v2.4/register');
  assert.deepEqual(JSON.parse(String(init?.body)),[{number:fedex.tracking,carrier:100003,lang:'pt',translation_mode:'UseDefaultLang',ship_date:'2026/09/10'}]);
  return response([{number:fedex.tracking,carrier:100003}]);
 },async()=>{const item=(await track17Batch([fedex])).get(trackingKey(fedex))!;assert.equal(calls,2);assert.equal(item.result,null);assert.match(item.error!,/aguardando retorno/);});
});
test('mixed success and pending do not re-register already subscribed numbers',async()=>{
 const ups={carrier:'UPS',tracking:'1ZA1030K0330380839'};let calls=0;
 await mockFetch(async()=>{calls++;return response([{number:fedex.tracking,carrier:100003,track_info:info()}],[{number:ups.tracking,carrier:100002,error:{code:-18019909}}]);},async()=>{
  const results=await track17Batch([fedex,ups]);assert.equal(calls,1);assert.ok(results.get(trackingKey(fedex))?.result);assert.equal(results.get(trackingKey(ups))?.result,null);
 });
});
test('duplicate-registration race is pending and quota exhaustion is actionable',async()=>{
 for(const code of [-18019901,-18019908])await mockFetch(async url=>String(url).endsWith('/gettrackinfo')?response([],[{number:fedex.tracking,carrier:100003,error:{code:-18019902}}]):response([],[{number:fedex.tracking,carrier:100003,error:{code}}]),async()=>{
  const result=(await track17Batch([fedex])).get(trackingKey(fedex))!;assert.equal(result.result,null);assert.match(result.error!,code===-18019901?/aguardando retorno/:/créditos/);
 });
});
test('rejects mismatched carriers, incomplete responses, HTTP and API-level failures',async()=>{
 const responses=[response([{number:fedex.tracking,carrier:100002,track_info:info('Delivered')}]),Response.json({code:0,data:{}}),Response.json({code:-18010002}),Response.json({code:0,data:{errors:[{code:-18019908}]}}),new Response('',{status:429}),new Response('',{status:401})];
 for(const r of responses)await mockFetch(async()=>r,async()=>{
  const result=(await track17Batch([fedex])).get(trackingKey(fedex))!;assert.equal(result.result,null);assert.ok(result.error);assert.ok(!result.error.includes('test-secret'));
 });
});
function memory(state:TrackingState){
 const sqlite=new DatabaseSync(':memory:');sqlite.exec('CREATE TABLE settings(id TEXT PRIMARY KEY,payload TEXT NOT NULL)');
 sqlite.prepare('INSERT INTO settings VALUES (?,?)').run('tracking-v1',JSON.stringify(state));
 function prepare(sql:string,args:SQLInputValue[]=[]){return {
  bind:(...values:SQLInputValue[])=>prepare(sql,values),
  first:async()=>sqlite.prepare(sql).get(...args)??null,
  run:async()=>({meta:{changes:Number(sqlite.prepare(sql).run(...args).changes)}}),
 };}
 setTestDatabase({prepare} as unknown as InventoryDatabase);return sqlite;
}
function shipment(index:number):TrackedShipment{return {id:String(index),sheet:'Setembro 2026',row:index+1,order:String(index),customer:'Test',carrier:'FedEx',tracking:String(100000000000+index),collected:'2026-09-10',orderStatus:'',historical:false,issue:null,result:null,error:null,attemptedAt:null};}
const state=(rows:TrackedShipment[]):TrackingState=>({rows,enabled:true,interval:15,source:'test.xlsx',importedAt:null,history:[]});
test('scheduler processes 82 codes in 40/40/2 batches and respects saved interval',async()=>{
 const rows=Array.from({length:82},(_,i)=>shipment(i));rows.push({...rows[0],id:'duplicate'});
 const sqlite=memory(state(rows)),sizes:number[]=[];
 try{await mockFetch(async(url,init)=>{
  assert.ok(String(url).endsWith('/gettrackinfo'));const request=JSON.parse(String(init?.body)) as {number:string;carrier:number}[];sizes.push(request.length);
  return response(request.map(r=>({...r,track_info:info()})));
 },async()=>{
  const updated=await refreshTracking();assert.deepEqual(sizes,[40,40,2]);assert.equal(updated.rows.filter(r=>r.result).length,83);
  await refreshTracking();assert.deepEqual(sizes,[40,40,2]);
  assert.equal((await readTracking()).history.length,83);
 });}finally{sqlite.close();setTestDatabase(undefined);}
});
test('failed refresh preserves last successful result; delivered/history skip automatic registration',async()=>{
 const delivered={...shipment(1),result:parseTrack17Result(info('Delivered'))},historical={...shipment(2),historical:true},active={...shipment(3),result:parseTrack17Result(info())};
 const sqlite=memory(state([delivered,historical,active]));let requests=0;
 try{await mockFetch(async(_url,init)=>{
  requests++;assert.deepEqual(JSON.parse(String(init?.body)),[{number:active.tracking,carrier:100003}]);return new Response('',{status:503});
 },async()=>{
  const updated=await refreshTracking();assert.equal(requests,1);assert.deepEqual(updated.rows[2].result,active.result);assert.match(updated.rows[2].error!,/503/);
  sqlite.prepare('UPDATE settings SET payload=? WHERE id=?').run(String(Date.now()+10000),'tracking-lock');
  await assert.rejects(()=>refreshTracking(true),/em andamento/);assert.equal(requests,1);
 });}finally{sqlite.close();setTestDatabase(undefined);}
});
