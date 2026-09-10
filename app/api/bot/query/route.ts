export const runtime="nodejs";
import { json,fail,body,ApiError } from "@/lib/server";
import { queryStock } from "@/lib/query-service";
import { hasBearer } from "@/lib/bot-auth";
import { whatsappMessages } from "@/lib/whatsapp-format";

// Server-to-server read-only endpoint. The caller's bot owns its end-user permissions.
export async function POST(request:Request){try{
 if(!await hasBearer(request,process.env.BOT_API_TOKEN))throw new ApiError(401,"Token do bot inválido.");
 const result=await queryStock((await body(request)).message);
 return json({version:1,text:result.text,messages:whatsappMessages(result.text),kind:result.kind,generatedAt:new Date().toISOString(),stores:result.connections.map(c=>({id:c.id,lastSync:c.lastSync,ready:c.catalogReady,error:c.error})),readOnly:true});
}catch(e){return fail(e);}}
