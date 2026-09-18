import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync,type SQLInputValue} from 'node:sqlite';
import {track17Batch,trackingKey,track17Carrier,parseTrack17Result} from '../lib/tracking-17track';
import {carrierReady} from '../lib/tracking-carriers';
import {refreshTracking,readTracking,trackingHistory,importTracking,type TrackingState,type TrackedShipment} from '../lib/tracking-service';
import ExcelJS from 'exceljs';
import {GET as historyRoute} from '../app/api/tracking/history/route';
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
  all:async()=>({results:sqlite.prepare(sql).all(...args)}),
  run:async()=>({meta:{changes:Number(sqlite.prepare(sql).run(...args).changes)}}),
 };}
 const batch=async(statements:ReturnType<typeof prepare>[])=>{
  sqlite.exec('BEGIN');try{const results=[];for(const statement of statements)results.push(await statement.run());sqlite.exec('COMMIT');return results;}catch(e){sqlite.exec('ROLLBACK');throw e;}
 };
 setTestDatabase({prepare,batch} as unknown as InventoryDatabase);return sqlite;
}
function shipment(index:number):TrackedShipment{return {id:String(index),sheet:'Setembro 2026',row:index+1,order:String(index),customer:'Test',carrier:'FedEx',tracking:String(100000000000+index),collected:'2026-09-10',orderStatus:'',historical:false,issue:null,result:null,error:null,attemptedAt:null};}
const state=(rows:TrackedShipment[]):TrackingState=>({rows,enabled:true,interval:15,source:'test.xlsx',importedAt:null,history:[]});
test('sheet-delivered rows and conflicting duplicate codes never contact providers, including manual by ID',async()=>{
 const delivered={...shipment(1),orderStatus:'ENTREGUE - 14/09/2026'},duplicate={...shipment(1),id:'duplicate'},marked={...shipment(3),deliveredInSheet:true};
 const sqlite=memory(state([delivered,duplicate,marked]));
 try{await mockFetch(async()=>{assert.fail('Delivered rows must never be queried or registered');},async()=>{
  await refreshTracking();await refreshTracking(true);await refreshTracking(true,delivered.id);await refreshTracking(true,duplicate.id);await refreshTracking(true,marked.id);
  const history=await trackingHistory({shipmentId:delivered.id});assert.equal(history.items.length,1);assert.equal(history.items[0].kind,'baseline');
  assert.equal((await readTracking()).rows[0].attemptedAt,null);
 });}finally{sqlite.close();setTestDatabase(undefined);}
});
test('history retains changed ETA and skips identical responses; cache/history commit atomically',async()=>{
 const row=shipment(1),sqlite=memory(state([row]));let count=0;
 try{await mockFetch(async()=>{const data=info();data.time_metrics.estimated_delivery_date.to=['2026-09-18','2026-09-20','2026-09-20','2026-09-22'][count++];return response([{number:row.tracking,carrier:100003,track_info:data}]);},async()=>{
  await refreshTracking(true);await refreshTracking(true);
  const history=await trackingHistory({shipmentId:row.id});assert.equal(history.items.length,3);
  assert.equal(history.items[0].data.response?.expectedDelivery,'2026-09-20');assert.equal(history.items[0].changed,false);
  assert.equal(history.items[1].data.response?.expectedDelivery,'2026-09-18');assert.equal(history.items[1].changed,true);
  await refreshTracking(true);
  assert.equal((await trackingHistory({shipmentId:row.id})).items.length,3);
  const saved=await readTracking();
  sqlite.exec("CREATE TRIGGER reject_history BEFORE INSERT ON tracking_history WHEN NEW.kind='consultation' BEGIN SELECT RAISE(ABORT,'test failure'); END;");
  await assert.rejects(()=>refreshTracking(true),/test failure/);
  assert.deepEqual(await readTracking(),saved);assert.equal((await trackingHistory({shipmentId:row.id})).items.length,3);
 });}finally{sqlite.close();setTestDatabase(undefined);}
});
test('legacy history migrates idempotently beyond 2000 records with stable pagination',async()=>{
 const initial=state([shipment(1)]);initial.history=Array.from({length:2005},(_,i)=>({id:'legacy-'+i,at:new Date(1700000000000+i*1000).toISOString(),status:'Em trânsito'}));
 const sqlite=memory(initial);
 try{
  const page1=await trackingHistory({limit:200});assert.equal(page1.items.length,200);assert.ok(page1.nextCursor);
  const page2=await trackingHistory({before:page1.nextCursor!,limit:200});assert.equal(page2.items.length,200);assert.ok(page2.items.every(x=>x.id<page1.nextCursor!));
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM tracking_history').get()!.n,2006);
  await trackingHistory();assert.equal(sqlite.prepare('SELECT count(*) AS n FROM tracking_history').get()!.n,2006);
  assert.equal((await trackingHistory({shipmentId:'legacy-3'})).items[0].status,'Em trânsito');
  assert.equal((await trackingHistory({tracking:"' OR 1=1 --"})).items.length,0);
 }finally{sqlite.close();setTestDatabase(undefined);}
});
test('reimport preserves removed orders and records new sheet-delivered orders without tracking',async()=>{
 const old=shipment(1),sqlite=memory(state([old]));
 try{
  const workbook=new ExcelJS.Workbook(),sheet=workbook.addWorksheet('Setembro 2026');
  sheet.addRow(['Pedido','Cliente','Trasportadora - AWB','Data da Coleta','Status']);
  sheet.addRow(['new-order','Test','FedEx - 999999999999',new Date('2026-09-10'),'Entregue']);
  const imported=await importTracking(Buffer.from(await workbook.xlsx.writeBuffer()),'next.xlsx');
  assert.equal(imported.rows.length,1);assert.equal(imported.rows[0].deliveredInSheet,true);
  const oldEvents=(await trackingHistory({shipmentId:old.id})).items;assert.deepEqual(oldEvents.map(x=>x.kind),['removed','baseline']);assert.equal(oldEvents[0].data.shipment?.customer,'Test');
  const newEvents=(await trackingHistory({order:'new-order'})).items;assert.equal(newEvents[0].kind,'import');
 }finally{sqlite.close();setTestDatabase(undefined);}
});
test('history endpoint rejects unauthenticated requests without leaking stored data',async()=>{
 assert.equal((await historyRoute(new Request('http://local/api/tracking/history'))).status,401);
});
test('scheduler processes 82 codes in 40/40/2 batches and respects saved interval',async()=>{
 const rows=Array.from({length:82},(_,i)=>shipment(i));rows.push({...rows[0],id:'duplicate'});
 const sqlite=memory(state(rows)),sizes:number[]=[];
 try{await mockFetch(async(url,init)=>{
  assert.ok(String(url).endsWith('/gettrackinfo'));const request=JSON.parse(String(init?.body)) as {number:string;carrier:number}[];sizes.push(request.length);
  return response(request.map(r=>({...r,track_info:info()})));
 },async()=>{
  const updated=await refreshTracking();assert.deepEqual(sizes,[40,40,2]);assert.equal(updated.rows.filter(r=>r.result).length,83);
  await refreshTracking();assert.deepEqual(sizes,[40,40,2]);
  assert.equal((await readTracking()).history.length,0);
  assert.equal(sqlite.prepare("SELECT count(*) AS n FROM tracking_history WHERE kind='consultation'").get()!.n,83);
 });}finally{sqlite.close();setTestDatabase(undefined);}
});
test('failed refresh preserves last successful result; delivered/history skip automatic registration',async()=>{
 const delivered={...shipment(1),result:parseTrack17Result(info('Delivered'))},historical={...shipment(2),historical:true},active={...shipment(3),result:parseTrack17Result(info())};
 const sqlite=memory(state([delivered,historical,active]));let requests=0;
 try{await mockFetch(async(_url,init)=>{
  requests++;assert.deepEqual(JSON.parse(String(init?.body)),[{number:active.tracking,carrier:100003}]);return new Response('',{status:503});
 },async()=>{
  const updated=await refreshTracking();assert.equal(requests,1);assert.deepEqual(updated.rows[2].result,active.result);assert.match(updated.rows[2].error!,/503/);
  const history=(await trackingHistory({shipmentId:active.id})).items;
  assert.equal(history[0].kind,'consultation');assert.equal(history[0].data.response,null);assert.match(history[0].data.error!,/503/);assert.deepEqual(history[0].data.shipment?.result,active.result);
  sqlite.prepare('UPDATE settings SET payload=? WHERE id=?').run(String(Date.now()+10000),'tracking-lock');
  await assert.rejects(()=>refreshTracking(true),/em andamento/);assert.equal(requests,1);
 });}finally{sqlite.close();setTestDatabase(undefined);}
});

 test('paused tracking scheduler performs no database writes',async()=>{
  const sqlite=memory({...state([shipment(1)]),enabled:false});
  try{
   const before=sqlite.prepare('SELECT total_changes() AS n').get()!.n;
   await refreshTracking();await refreshTracking();
   assert.equal(sqlite.prepare('SELECT total_changes() AS n').get()!.n,before);
  }finally{sqlite.close();setTestDatabase(undefined);}
 });
