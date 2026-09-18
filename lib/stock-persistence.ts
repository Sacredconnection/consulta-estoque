import type {InventoryDatabase,Statement} from './database';
import type {Product,StoreId} from './inventory';

// Collection time is not a stock change. last_sync records the last complete check.
export function stockContent(product:Product){
 return JSON.stringify({...product,stocks:product.stocks.map(({updatedAt,...stock})=>stock)});
}
export async function prepareCatalogPage(db:InventoryDatabase,input:{storeId:StoreId;runId:string;token:string;records:Product[];seen:number[];done:boolean}){
 const {storeId,runId,token,records,done}=input;
 const connection=await db.prepare('SELECT snapshot FROM connections WHERE id=?').bind(storeId).first<{snapshot:string|null}>();
 const snapshot=connection?.snapshot??runId;
 const ids=records.map(p=>p.stocks[0].id);
 const seen=[...new Set([...input.seen,...ids])];
 const saved=connection?.snapshot&&ids.length?await db.prepare('SELECT product_id,payload FROM records WHERE snapshot=? AND store_id=? AND product_id IN (SELECT value FROM json_each(?))').bind(snapshot,storeId,JSON.stringify(ids)).all<{product_id:number;payload:string}>():{results:[]};
 const existing=new Map(saved.results.map(row=>[row.product_id,stockContent(JSON.parse(row.payload))]));
 const changed=records.filter(p=>existing.get(p.stocks[0].id)!==stockContent(p));
 const unchanged=records.filter(p=>existing.get(p.stocks[0].id)===stockContent(p)).map(p=>p.stocks[0].id);
 const guard="EXISTS (SELECT 1 FROM connections c JOIN sync_jobs j ON j.store_id=c.id WHERE c.id=? AND c.lock_token=? AND j.run_id=? AND j.status='running')";
 const statements:Statement[]=[];
 // Remove abandoned staging only; the published catalogue and this run survive.
 if(!input.seen.length)statements.push(db.prepare('DELETE FROM records WHERE store_id=? AND snapshot NOT IN (?,?) AND '+guard).bind(storeId,snapshot,runId,storeId,token,runId));
 if(changed.length)statements.push(db.prepare("INSERT INTO records (snapshot,store_id,product_id,payload) SELECT ?,?,json_extract(value,'$.stocks[0].id'),value FROM json_each(?) WHERE "+guard+" ON CONFLICT(snapshot,store_id,product_id) DO UPDATE SET payload=excluded.payload WHERE records.payload!=excluded.payload").bind(runId,storeId,JSON.stringify(changed),storeId,token,runId));
 // Handle duplicate source IDs that revert to their published value on a later page.
 if(unchanged.length&&snapshot!==runId)statements.push(db.prepare('DELETE FROM records WHERE snapshot=? AND store_id=? AND product_id IN (SELECT value FROM json_each(?)) AND '+guard).bind(runId,storeId,JSON.stringify(unchanged),storeId,token,runId));
 if(done){
  if(snapshot!==runId)statements.push(db.prepare('INSERT INTO records(snapshot,store_id,product_id,payload) SELECT ?,store_id,product_id,payload FROM records WHERE snapshot=? AND store_id=? AND '+guard+' ON CONFLICT(snapshot,store_id,product_id) DO UPDATE SET payload=excluded.payload WHERE records.payload!=excluded.payload').bind(snapshot,runId,storeId,storeId,token,runId));
  statements.push(db.prepare('DELETE FROM records WHERE snapshot=? AND store_id=? AND product_id NOT IN (SELECT value FROM json_each(?)) AND '+guard).bind(snapshot,storeId,JSON.stringify(seen),storeId,token,runId));
  statements.push(db.prepare('DELETE FROM records WHERE store_id=? AND snapshot!=? AND '+guard).bind(storeId,snapshot,storeId,token,runId));
 }
 return {statements,seen,snapshot};
}
