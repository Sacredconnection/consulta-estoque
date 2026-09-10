import { stockCategories } from './category-filter';
import { combineSacredChannels } from './sacred-catalog';
import { getDatabase } from "./database";
import { databaseErrorMessage } from "./database-errors";
import { validAccess } from "./auth";
import { environmentConnections, connectionSetupIssues, type EnvironmentValues } from "./connections-env";
import { STORES, DEFAULT_RULE, scopeProductsToStores, type Rule, type Product, type StoreId } from "./inventory";
import { IntegrationError, mergeCatalog } from "./woo";
import { CATALOG_VERSION } from "./catalog-policy";
import { visibleCatalog } from './catalog-visibility';
type Connection={id:StoreId;credentials:string;snapshot:string|null;last_sync:string|null;error:string|null;lock_until:number;catalog_version:number|null;source_revision:number;snapshot_revision:number};
export class ApiError extends Error {constructor(public status:number,message:string){super(message);}}
export function database(){return getDatabase();}
export function authorize(request:Request,mutation=false){
 // Validate credentials here as well as at the page boundary.
 if(!validAccess(request))throw new ApiError(401,"Entre com seu usuário e senha para acessar o estoque.");
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
 const databaseMessage=databaseErrorMessage(error);
 if(databaseMessage)return json({error:databaseMessage},503);
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
 return [...environmentConnections(process.env as EnvironmentValues),{id:"pagnier" as const,retail:undefined}];
}
export async function ensureEnvironmentConnections(){
 const configured=configuredEnvironmentConnections();
 if(configured.length)await database().batch(configured.map(c=>database().prepare(
  "INSERT INTO connections (id,credentials) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET credentials=excluded.credentials WHERE connections.credentials != excluded.credentials"
 ).bind(c.id,"environment")));
 return configured;
}
export async function getConnections(){
 const configured=await ensureEnvironmentConnections(),db=database();
 const [rows,jobs]=await Promise.all([
  db.prepare("SELECT id,snapshot,last_sync,error,lock_until,source_revision,snapshot_revision,(SELECT json_extract(payload,'$.catalogVersion') FROM records WHERE store_id=connections.id AND snapshot=connections.snapshot LIMIT 1) AS catalog_version FROM connections").all<Connection>(),
  db.prepare("SELECT store_id,run_id,status,cursor,updated_at,error FROM sync_jobs").all<{store_id:StoreId;run_id:string;status:string;cursor:string;updated_at:string;error:string|null}>(),
 ]);
 return STORES.filter(s=>configured.some(c=>c.id===s.id)).map(s=>{
  const c=rows.results.find(r=>r.id===s.id),job=jobs.results.find(j=>j.store_id===s.id);
  const cursor=job?JSON.parse(job.cursor) as {sacredSources?:string;catalogVersion?:number;productsDone:number;totalProducts:number;records:number}:null;
  const incompatible=cursor?.catalogVersion!==CATALOG_VERSION||(s.id==="sacred"&&cursor?.sacredSources!==(configured.find(x=>x.id==="sacred")?.retail?.siteUrl??""));
  const catalogReady=c?.catalog_version===CATALOG_VERSION||(!incompatible&&job?.status==="succeeded");
  const sourceRevision=c?.source_revision??0;
  const needsSync=incompatible||!catalogReady||sourceRevision>(c?.snapshot_revision??0);
  const running=!incompatible&&job?.status==="running";
  return {id:s.id,catalogReady,needsSync,sourceRevision,connected:true,source:s.id==="pagnier"?"public-report":"environment",lastSync:c?.last_sync??null,error:running?null:job?.error??c?.error??null,
   sync:job&&!incompatible?{runId:job.run_id,status:job.status,productsDone:cursor!.productsDone,totalProducts:cursor!.totalProducts,records:cursor!.records,updatedAt:job.updated_at,locked:running&&(c?.lock_until??0)>Date.now()}:null};
 });
}
export async function state(){
 const [connections,rule]=await Promise.all([getConnections(),getRule()]);
 const ids=connections.map(c=>c.id);
 const records=ids.length?await database().prepare("SELECT r.payload FROM records r INNER JOIN connections c ON r.store_id=c.id AND r.snapshot=c.snapshot WHERE r.store_id IN ("+ids.map(()=>"?").join(",")+")").bind(...ids).all<{payload:string}>():{results:[]};
 const products=scopeProductsToStores(mergeCatalog(combineSacredChannels(visibleCatalog(records.results.map(r=>withSourceCategories(JSON.parse(r.payload) as Product)).filter(p=>p.catalogVersion===CATALOG_VERSION)))),ids);
 return {demo:false,products,rule,connections,connectionSetup:connectionSetupIssues(process.env)};
}

function withSourceCategories(p:Product):Product{return {...p,stocks:p.stocks.map(s=>({...s,categories:stockCategories(p,s)}))};}
