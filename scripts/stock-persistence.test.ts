import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {getClient,getDatabase} from '../lib/database';
import {prepareCatalogPage} from '../lib/stock-persistence';
import type {Product} from '../lib/inventory';
const product=(id:number,quantity=10,updatedAt='old'):Product=>({key:String(id),sku:String(id),name:'Product '+id,category:'Test',stocks:[{id,storeId:'pagnier',quantity,status:'instock',updatedAt}]});
test('incremental publication preserves atomic snapshots and avoids unchanged record writes',async t=>{
 process.env.TURSO_DATABASE_URL='file::memory:';
 const db=getDatabase();
 try{
  for(const name of ['0000_free_cerebro','0001_puzzling_goliath','0002_persistent_cache'])for(const sql of (await readFile('drizzle/'+name+'.sql','utf8')).split('--> statement-breakpoint').filter(s=>s.trim()))await db.prepare(sql).run();
  await db.prepare("INSERT INTO connections(id,credentials,snapshot,lock_token) VALUES ('pagnier','environment','base','owner')").run();
  await db.prepare("INSERT INTO sync_jobs(store_id,run_id,status,cursor,started_at,updated_at) VALUES ('pagnier','next','running','{}','','')").run();
  const seed=Array.from({length:1000},(_,i)=>product(i+1));
  await db.prepare("INSERT INTO records SELECT 'base','pagnier',json_extract(value,'$.stocks[0].id'),value FROM json_each(?)").bind(JSON.stringify(seed)).run();
  const prepare=(records:Product[],seen:number[]=[],done=true,token='owner')=>prepareCatalogPage(db,{storeId:'pagnier',runId:'next',token,records,seen,done});
  const saved=async(id:number)=>JSON.parse((await db.prepare("SELECT payload FROM records WHERE snapshot='base' AND store_id='pagnier' AND product_id=?").bind(id).first<{payload:string}>())!.payload) as Product;
  await t.test('1000 unchanged products cause zero record writes, including changed collection timestamps',async()=>{
   const page=await prepare(seed.map(p=>({...p,stocks:p.stocks.map(s=>({...s,updatedAt:'new'}))})));
   assert.equal((await db.batch(page.statements)).reduce((n,r)=>n+r.meta.changes,0),0);
   assert.equal((await saved(1)).stocks[0].updatedAt,'old');
  });
  await t.test('changed rows remain invisible until completion; rollback preserves the old catalogue',async()=>{
   const first=await prepare([product(1,22)],[],false);await db.batch(first.statements);
   assert.equal((await saved(1)).stocks[0].quantity,10);
   const final=await prepare(seed.slice(1),JSON.parse(JSON.stringify(first.seen)));
   await assert.rejects(db.batch([...final.statements,db.prepare('INSERT INTO missing_table VALUES (1)')]));
   assert.equal((await saved(1)).stocks[0].quantity,10);
   const writes=await db.batch(final.statements);
   assert.equal(writes.reduce((n,r)=>n+r.meta.changes,0),2); // one update and one staging delete
   assert.equal((await saved(1)).stocks[0].quantity,22);
   assert.equal((await db.prepare('SELECT count(*) AS n FROM records').first<{n:number}>())!.n,1000);
  });
  await t.test('insertions/removals publish together and only touch changed rows',async()=>{
   const page=await prepare([...seed.slice(2),product(1,22),product(-7,4)]);
   await db.batch(page.statements);
   assert.equal(await db.prepare("SELECT payload FROM records WHERE snapshot='base' AND product_id=2").first(),null);
   assert.equal((await saved(-7)).stocks[0].quantity,4);
  });
  await t.test('lost ownership prevents staging, deletion and publication',async()=>{
   const before=await db.prepare('SELECT * FROM records ORDER BY product_id').all();
   const page=await prepare([product(1,99)],[],true,'stale-owner');
   assert.equal((await db.batch(page.statements)).reduce((n,r)=>n+r.meta.changes,0),0);
   assert.deepEqual(await db.prepare('SELECT * FROM records ORDER BY product_id').all(),before);
  });
  await t.test('abandoned staging is cleaned without deleting published data',async()=>{
   await db.prepare("INSERT INTO records VALUES ('failed','pagnier',1,?)").bind(JSON.stringify(product(1,99))).run();
   const page=await prepare([product(1,22)],[],false);await db.batch(page.statements);
   assert.equal(await db.prepare("SELECT * FROM records WHERE snapshot='failed'").first(),null);
   assert.equal((await saved(1)).stocks[0].quantity,22);
  });
  await t.test('empty completed catalogue removes vanished products',async()=>{
   await db.batch((await prepare([])).statements);
   assert.equal((await db.prepare('SELECT count(*) AS n FROM records').first<{n:number}>())!.n,0);
  });
  await t.test('first import can resume with no published snapshot',async()=>{
   await db.prepare("UPDATE connections SET snapshot=NULL WHERE id='pagnier'").run();
   const first=await prepare([product(1)],[],false);await db.batch(first.statements);
   await db.batch((await prepare([product(2)],first.seen)).statements);
   assert.equal((await db.prepare("SELECT count(*) AS n FROM records WHERE snapshot='next'").first<{n:number}>())!.n,2);
  });
 }finally{getClient().close();delete process.env.TURSO_DATABASE_URL;}
});
