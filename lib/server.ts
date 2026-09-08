import { env } from "cloudflare:workers";
import { environmentConnections, type EnvironmentValues } from "./connections-env";
import { STORES, DEFAULT_RULE, scopeProductsToStores, type Rule, type Product, type StoreId } from "./inventory";
import { IntegrationError, readCatalog, mergeCatalog } from "./woo";
type Connection={id:StoreId;credentials:string;snapshot:string|null;last_sync:string|null;error:string|null;lock_until:number};
export class ApiError extends Error {constructor(public status:number,message:string){super(message);}}
export function database(){return env.DB;}
export function authorize(request:Request,mutation=false){
 // Sites strips and forwards identity headers; the deployment access policy is owner-only.
 if(!request.headers.get("oai-authenticated-user-id"))throw new ApiError(401,"Entre com sua conta para acessar o estoque.");
 if(mutation){
  const origin=request.headers.get("origin");const expected=new URL(request.url).origin;
  if(origin&&origin!==expected)throw new ApiError(403,"Origem da solicitação não permitida.");
  if(request.headers.get("sec-fetch-site")==="cross-site")throw new ApiError(403,"Solicitação de outro site não permitida.");
 }
}
export function json(value:unknown,status=200){return Response.json(value,{status,headers:{"Cache-Control":"no-store, private","X-Content-Type-Options":"nosniff"}});}
export function fail(error:unknown){
 if(error instanceof ApiError)return json({error:error.message},error.status);
 if(error instanceof IntegrationError)return json({error:error.message},502);
 console.error("Inventory operation failed",error instanceof Error?error.name:"UnknownError");
 return json({error:"Não foi possível concluir a operação. Tente novamente."},500);
}
export async function body(request:Request){
 const value=await request.text();if(value.length>5000)throw new ApiError(413,"Solicitação muito grande.");
 try{const parsed=JSON.parse(value);if(!parsed||typeof parsed!=="object"||Array.isArray(parsed))throw Error();return parsed;}catch{throw new ApiError(400,"Dados inválidos.");}
}
export async function getRule():Promise<Rule>{
 const row=await database().prepare("SELECT payload FROM settings WHERE id = ?").bind("rule").first<{payload:string}>();
 return row?JSON.parse(row.payload):DEFAULT_RULE;
}
export function configuredEnvironmentConnections(){
 return environmentConnections(env as unknown as EnvironmentValues);
}
async function ensureEnvironmentConnections(){
 const configured=configuredEnvironmentConnections();
 if(configured.length)await database().batch(configured.map(c=>database().prepare(
  "INSERT INTO connections (id,credentials) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET credentials=excluded.credentials WHERE connections.credentials != excluded.credentials"
 ).bind(c.id,"environment")));
 return configured;
}
export async function state(){
 const db=database();
 const configured=await ensureEnvironmentConnections();
 const [rows,rule]=await Promise.all([db.prepare("SELECT id,credentials,snapshot,last_sync,error FROM connections").all<Connection>(),getRule()]);
 const records=await db.prepare("SELECT r.payload FROM records r INNER JOIN connections c ON r.store_id=c.id AND r.snapshot=c.snapshot").all<{payload:string}>();
 const activeStores=STORES.filter(s=>configured.some(c=>c.id===s.id));
 const products=scopeProductsToStores(mergeCatalog(records.results.map(r=>JSON.parse(r.payload) as Product)),activeStores.map(s=>s.id));
 return {demo:false,products,rule,connections:activeStores.map(s=>{const c=rows.results.find(r=>r.id===s.id);const source="environment";const available=configured.some(e=>e.id===s.id);return{id:s.id,connected:available,source,lastSync:c?.last_sync??null,error:c&&!available?"Credenciais removidas do ambiente.":c?.error??null};})};
}
async function syncStore(storeId:StoreId){
 const db=database(),token=crypto.randomUUID();
 const lock=await db.prepare("UPDATE connections SET lock_until=?,lock_token=? WHERE id=? AND lock_until < ?").bind(Date.now()+180000,token,storeId,Date.now()).run();
 if(!lock.meta.changes)return {id:storeId,ok:false,error:"Uma sincronização já está em andamento."};
 try{
  const connection=await db.prepare("SELECT * FROM connections WHERE id=?").bind(storeId).first<Connection>();
  if(!connection)throw new IntegrationError("A conexão não foi encontrada.");
  const at=new Date().toISOString();
  const environment=configuredEnvironmentConnections().find(c=>c.id===storeId);
  if(!environment)throw new IntegrationError("Credenciais da loja não estão disponíveis no ambiente.");
  const credentials=environment;
  const records=await readCatalog(storeId,credentials,at);
  const snapshot=crypto.randomUUID();
  for(let offset=0;offset<records.length;offset+=60){
   // Renew only our lease, and never publish if another job has taken over.
   const renewed=await db.prepare("UPDATE connections SET lock_until=? WHERE id=? AND lock_token=?").bind(Date.now()+180000,storeId,token).run();
   if(!renewed.meta.changes)throw new IntegrationError("A sincronização expirou. Tente novamente.");
   await db.batch(records.slice(offset,offset+60).map(record=>db.prepare("INSERT INTO records (snapshot,store_id,product_id,payload) VALUES (?,?,?,?)").bind(snapshot,storeId,record.stocks[0].id,JSON.stringify(record))));
  }
  const published=await db.prepare("UPDATE connections SET snapshot=?,last_sync=?,error=NULL WHERE id=? AND lock_token=?").bind(snapshot,at,storeId,token).run();
  if(!published.meta.changes)throw new IntegrationError("A sincronização expirou sem publicar os novos dados.");
  // Keep current and previous snapshots to avoid deleting rows written by another in-flight job.
  if(connection.snapshot)await db.prepare("DELETE FROM records WHERE store_id=? AND snapshot=?").bind(storeId,connection.snapshot).run();
  return {id:storeId,ok:true,count:records.length};
 }catch(e){
  const message=e instanceof IntegrationError?e.message:"Não foi possível atualizar esta loja. Verifique a conexão.";
  await db.prepare("UPDATE connections SET error=? WHERE id=? AND lock_token=?").bind(message,storeId,token).run();
  return {id:storeId,ok:false,error:message};
 }finally{await db.prepare("UPDATE connections SET lock_until=0,lock_token=NULL WHERE id=? AND lock_token=?").bind(storeId,token).run();}
}
export async function synchronize(){
 const configured=await ensureEnvironmentConnections();
 if(!configured.length)throw new ApiError(400,"Configure uma loja no arquivo local de ambiente antes de sincronizar.");
 // Independent shops may fail without hiding the last successful snapshot.
 return Promise.all(configured.map(s=>syncStore(s.id)));
}
