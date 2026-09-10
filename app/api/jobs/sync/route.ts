import { json,fail,getRule,body,ApiError } from "@/lib/server";
import {startSynchronization,advanceSynchronization} from "@/lib/sync-service";
import {STORES} from "@/lib/inventory";
export async function POST(request:Request){try{
 const expected=process.env.SYNC_JOB_TOKEN;
 const supplied=request.headers.get("Authorization")?.replace(/^Bearer /,"");
 if(!expected||!supplied)throw new ApiError(401,"Credencial de agendamento inválida.");
 const digest=async(s:string)=>new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s)));
 const [a,b]=await Promise.all([digest(expected),digest(supplied)]);let mismatch=0;for(let i=0;i<a.length;i++)mismatch|=a[i]^b[i];
 if(mismatch)throw new ApiError(401,"Credencial de agendamento inválida.");
 const input=request.headers.get("content-type")?.includes("application/json")?await body(request):{action:"start"};
 if(input.action==="step"){
  if(!STORES.some(s=>s.id===input.storeId)||typeof input.runId!=="string"||input.runId.length>80)throw new ApiError(400,"Etapa inválida.");
  return json(await advanceSynchronization(input.storeId,input.runId));
 }
 if(input.action&&input.action!=="start")throw new ApiError(400,"Ação inválida.");
 const rule=await getRule();if(!rule.enabled)return json({skipped:true,reason:"Monitoramento pausado."});
 return json(await startSynchronization({scheduled:true}));
}catch(e){return fail(e);}}

export const runtime = "nodejs";
export const maxDuration = 300;

// Vercel calls GET with its CRON_SECRET. Process checkpoints within the budget;
// any unfinished job is resumed by the next invocation, without losing the cache.
export async function GET(request:Request){try{
 const secret=process.env.CRON_SECRET;
 const {hasBearer}=await import("@/lib/bot-auth");
 if(!await hasBearer(request,secret))throw new ApiError(401,"Credencial de agendamento inválida.");
 if(!(await getRule()).enabled)return json({skipped:true});
 const until=Date.now()+200000;
 let result=await startSynchronization({scheduled:true});
 while(Date.now()<until){
  const active=result.connections.filter(c=>c.sync?.status==='running');
  if(!active.length)break;
  const rounds=await Promise.all(active.map(c=>advanceSynchronization(c.id,c.sync!.runId)));
  const {getConnections}=await import("@/lib/server");
  result={connections:await getConnections(),message:'Atualização automática.'};
  if(rounds.some(round=>round.busy))break;
 }
 return json({running:result.connections.some(c=>c.sync?.status==='running'),failed:result.connections.filter(c=>c.error).map(c=>c.id)});
}catch(e){return fail(e);}}
