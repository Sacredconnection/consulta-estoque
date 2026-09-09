import {authorize,json,fail,getConnections,body,ApiError} from "@/lib/server";
import {startSynchronization,advanceSynchronization} from "@/lib/sync-service";
import {STORES} from "@/lib/inventory";
export async function GET(request:Request){try{authorize(request);return json({connections:await getConnections()});}catch(e){return fail(e);}}
export async function POST(request:Request){try{
 authorize(request,true);
 const input=request.headers.get("content-type")?.includes("application/json")?await body(request):{action:"start"};
 if(!input.action||input.action==="start"){
  if(input.force!==undefined&&typeof input.force!=="boolean")throw new ApiError(400,"Opção de atualização inválida.");
  if(input.storeId!==undefined&&!STORES.some(s=>s.id===input.storeId))throw new ApiError(400,"Fonte inválida.");
  return json(await startSynchronization({force:input.force,storeId:input.storeId}));
 }
 if(input.action!=="step"||!STORES.some(s=>s.id===input.storeId)||typeof input.runId!=="string"||input.runId.length>80)throw new ApiError(400,"Etapa de sincronização inválida.");
 return json(await advanceSynchronization(input.storeId,input.runId));
}catch(e){return fail(e);}}

export const runtime = "nodejs";
export const maxDuration = 60;
