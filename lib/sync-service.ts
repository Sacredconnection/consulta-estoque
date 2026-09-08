import { database,configuredEnvironmentConnections,ensureEnvironmentConnections,getConnections,ApiError } from "./server";
import { initialCursor,advanceCatalog,type CatalogCursor } from "./sync-cursor";
import { IntegrationError } from "./woo";
import type { StoreId } from "./inventory";
type Job={store_id:StoreId;run_id:string;status:string;cursor:string;started_at:string;updated_at:string;error:string|null};
const owned="EXISTS (SELECT 1 FROM connections WHERE id=? AND lock_token=?)";
export async function startSynchronization(){
 const configured=await ensureEnvironmentConnections();
 if(!configured.length)throw new ApiError(400,"Configure uma loja no arquivo local de ambiente antes de sincronizar.");
 const current=await getConnections();
 // Repeated clicks or reloads resume an active run instead of restarting completed shops.
 if(current.some(c=>c.sync?.status==="running"))return {connections:current,message:"Atualização em andamento. Retomando do último progresso salvo."};
 const at=new Date().toISOString();
 await database().batch(configured.flatMap(c=>[
  database().prepare("INSERT INTO sync_jobs (store_id,run_id,status,cursor,started_at,updated_at,error) VALUES (?,?,?,?,?,?,NULL) ON CONFLICT(store_id) DO UPDATE SET run_id=excluded.run_id,status=excluded.status,cursor=excluded.cursor,started_at=excluded.started_at,updated_at=excluded.updated_at,error=NULL WHERE sync_jobs.status!='running'").bind(c.id,crypto.randomUUID(),"running",JSON.stringify(initialCursor()),at,at),
  database().prepare("UPDATE connections SET error=NULL WHERE id=? AND EXISTS (SELECT 1 FROM sync_jobs WHERE store_id=? AND status='running')").bind(c.id,c.id),
 ]));
 return {connections:await getConnections(),message:"Atualização iniciada. O progresso de cada loja será mostrado abaixo."};
}
export async function advanceSynchronization(storeId:StoreId,runId:string){
 const credentials=configuredEnvironmentConnections().find(c=>c.id===storeId);
 if(!credentials)throw new ApiError(400,"Loja sem credenciais configuradas.");
 const db=database(),token=crypto.randomUUID();
 const claim=await db.prepare("UPDATE connections SET lock_until=?,lock_token=? WHERE id=? AND lock_until<?").bind(Date.now()+65000,token,storeId,Date.now()).run();
 if(!claim.meta.changes)return {busy:true,connections:await getConnections()};
 try{
  const job=await db.prepare("SELECT * FROM sync_jobs WHERE store_id=?").bind(storeId).first<Job>();
  if(!job||job.run_id!==runId)throw new ApiError(409,"A execução foi substituída. Consulte o progresso atual.");
  if(job.status!=="running")return {busy:false,connections:await getConnections()};
  const previous=JSON.parse(job.cursor) as CatalogCursor;
  const result=await advanceCatalog(storeId,credentials,previous);
  const at=new Date().toISOString();
  // Records, checkpoint and final publication commit in one D1 transaction.
  // json_each keeps the batch bounded to a few SQL statements even for hundreds of variants.
  const statements=[
   db.prepare("INSERT INTO records (snapshot,store_id,product_id,payload) SELECT ?,?,json_extract(value,'$.stocks[0].id'),value FROM json_each(?) WHERE "+owned+" ON CONFLICT(snapshot,store_id,product_id) DO UPDATE SET payload=excluded.payload").bind(runId,storeId,JSON.stringify(result.records),storeId,token),
   db.prepare("UPDATE sync_jobs SET cursor=?,status=?,updated_at=?,error=NULL WHERE store_id=? AND run_id=? AND "+owned).bind(JSON.stringify(result.cursor),result.done?"succeeded":"running",at,storeId,runId,storeId,token),
  ];
  if(result.done)statements.push(db.prepare("UPDATE connections SET snapshot=?,last_sync=?,error=NULL WHERE id=? AND lock_token=?").bind(runId,at,storeId,token));
  const committed=await db.batch(statements);
  if(!committed[1].meta.changes)return {busy:true,connections:await getConnections()};
  if(result.done)await db.prepare("DELETE FROM records WHERE store_id=? AND snapshot!=? AND "+owned).bind(storeId,runId,storeId,token).run();
  return {busy:false,connections:await getConnections()};
 }catch(error){
  if(error instanceof ApiError)throw error;
  const message=error instanceof IntegrationError?error.message:"Não foi possível concluir esta etapa. Clique em atualizar para tentar novamente.";
  const at=new Date().toISOString();
  await db.batch([
   db.prepare("UPDATE sync_jobs SET status='failed',error=?,updated_at=? WHERE store_id=? AND run_id=? AND "+owned).bind(message,at,storeId,runId,storeId,token),
   db.prepare("UPDATE connections SET error=? WHERE id=? AND lock_token=?").bind(message,storeId,token),
  ]);
  return {busy:false,connections:await getConnections()};
 }finally{
  await db.prepare("UPDATE connections SET lock_until=0,lock_token=NULL WHERE id=? AND lock_token=?").bind(storeId,token).run();
 }
}
