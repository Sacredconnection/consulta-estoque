import { env } from "cloudflare:workers";
import { json,fail,getRule,body,ApiError,getConnections } from "@/lib/server";
import {startSynchronization,advanceSynchronization} from "@/lib/sync-service";
import {STORES} from "@/lib/inventory";
export async function POST(request:Request){try{
 const expected=(env as unknown as {SYNC_JOB_TOKEN?:string}).SYNC_JOB_TOKEN;
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
 const current=await getConnections();
 if(current.length&&current.every(c=>c.lastSync&&Date.now()-Date.parse(c.lastSync)<rule.interval*60000))return json({skipped:true,reason:"Intervalo mínimo ainda não atingido."});
 return json(await startSynchronization());
}catch(e){return fail(e);}}
