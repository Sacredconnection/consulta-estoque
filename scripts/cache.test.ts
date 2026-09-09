import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { getClient, getDatabase } from '../lib/database';
import { startSynchronization } from '../lib/sync-service';
import { getConnections } from '../lib/server';
import { initialCursor } from '../lib/sync-cursor';
import { shouldStartSynchronization } from '../lib/cache-policy';
import { validStockNotification } from '../lib/stock-notifications';
import { POST } from '../app/api/webhooks/stock/[storeId]/route';

test('persistent cache survives repeated starts and invalidates only the changed source',async()=>{
 process.env.TURSO_DATABASE_URL='file::memory:';
 process.env.WOO_MAYA_KEY='test-key';process.env.WOO_MAYA_SECRET='test-secret';process.env.PAGNIER_CHANGE_TOKEN='test-notification';
 const db=getDatabase();
 try{
  for(const name of ['0000_free_cerebro','0001_puzzling_goliath','0002_persistent_cache']){
   const sql=await readFile('drizzle/'+name+'.sql','utf8');
   for(const statement of sql.split('--> statement-breakpoint').filter(s=>s.trim()))await db.prepare(statement).run();
  }
  const at='2020-01-01T00:00:00Z';
  for(const id of ['maya','pagnier']){
   await db.prepare('INSERT INTO connections (id,credentials,snapshot,last_sync) VALUES (?,?,?,?)').bind(id,'environment','saved-'+id,at).run();
   await db.prepare('INSERT INTO sync_jobs (store_id,run_id,status,cursor,started_at,updated_at) VALUES (?,?,?,?,?,?)').bind(id,'saved-'+id,'succeeded',JSON.stringify(initialCursor()),at,at).run();
  }
  const originalFetch=globalThis.fetch;globalThis.fetch=(async()=>{throw Error('Cached sources must not call upstream');}) as typeof fetch;
  try{
   for(let i=0;i<3;i++){
    const result=await startSynchronization();assert.equal(result.cached,true);
    assert.ok(result.connections.every(c=>c.catalogReady&&!c.needsSync&&c.lastSync===at));
   }
  }finally{globalThis.fetch=originalFetch;}
  const unauthenticated=await POST(new Request('https://example.test',{method:'POST',body:'{}'}),{params:Promise.resolve({storeId:'pagnier'})});
  assert.equal(unauthenticated.status,401);
  const notification=()=>POST(new Request('https://example.test',{method:'POST',headers:{authorization:'Bearer test-notification'},body:'{}'}),{params:Promise.resolve({storeId:'pagnier'})});
  assert.equal((await notification()).status,200);
  const result=await startSynchronization();
  assert.equal(result.connections.find(c=>c.id==='maya')?.sync?.runId,'saved-maya');
  assert.equal(result.connections.find(c=>c.id==='pagnier')?.sync?.status,'running');
  const pending=await db.prepare('SELECT cursor FROM sync_jobs WHERE store_id=?').bind('pagnier').first<{cursor:string}>();
  assert.equal(JSON.parse(pending!.cursor).sourceRevision,1);
  const resume=await startSynchronization();
  assert.equal(resume.connections.find(c=>c.id==='pagnier')?.sync?.runId,result.connections.find(c=>c.id==='pagnier')?.sync?.runId);
  await notification();
  // Publication of the first revision must not acknowledge a later notification.
  await db.prepare('UPDATE connections SET snapshot_revision=1 WHERE id=?').bind('pagnier').run();
  assert.equal((await getConnections()).find(c=>c.id==='pagnier')?.needsSync,true);
 }finally{getClient().close();delete process.env.TURSO_DATABASE_URL;delete process.env.WOO_MAYA_KEY;delete process.env.WOO_MAYA_SECRET;delete process.env.PAGNIER_CHANGE_TOKEN;}
});

test('cache policy preserves successful empty snapshots and resumes running jobs',()=>{
 assert.equal(shouldStartSynchronization({catalogReady:true,needsSync:false,sync:{status:'succeeded'}}),false);
 assert.equal(shouldStartSynchronization({catalogReady:true,needsSync:true,sync:{status:'running'}},true),false);
 assert.equal(shouldStartSynchronization({catalogReady:true,needsSync:true}),true);
 assert.equal(shouldStartSynchronization({catalogReady:false}),true);
 assert.equal(shouldStartSynchronization({catalogReady:true,needsSync:false},true),true);
});

test('WooCommerce cache notifications require the correct source signature and exact payload',()=>{
 const raw=Buffer.from('{"id":123}'),secret='test-signing-secret';
 const headers=new Headers({'x-wc-webhook-signature':createHmac('sha256',secret).update(raw).digest('base64')});
 const env={WOO_SACRED_WEBHOOK_SECRET:secret};
 assert.equal(validStockNotification('sacred',headers,raw,env),true);
 assert.equal(validStockNotification('maya',headers,raw,env),false);
 assert.equal(validStockNotification('sacred',headers,Buffer.from('{}'),env),false);
 assert.equal(validStockNotification('sacred',new Headers(),raw,env),false);
});
