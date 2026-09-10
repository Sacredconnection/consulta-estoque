import { database,json,fail,ApiError } from "@/lib/server";
import { secretEquals } from "@/lib/bot-auth";
import { whatsappConfig,validMetaSignature } from "@/lib/whatsapp-meta";
import { enqueueWhatsApp } from "@/lib/whatsapp-queue";
import type { EnvironmentValues } from "@/lib/connections-env";
export const runtime="nodejs";
const config=()=>whatsappConfig(process.env as EnvironmentValues);
export async function GET(request:Request){try{
 const c=config();if(!c)throw new ApiError(503,"WhatsApp não configurado.");
 const url=new URL(request.url),challenge=url.searchParams.get("hub.challenge");
 if(url.searchParams.get("hub.mode")!=="subscribe"||!challenge||challenge.length>1000||!await secretEquals(url.searchParams.get("hub.verify_token")??"",c.verifyToken))throw new ApiError(403,"Verificação inválida.");
 return new Response(challenge,{headers:{"Content-Type":"text/plain","Cache-Control":"no-store"}});
}catch(e){return fail(e);}}
export async function POST(request:Request){try{
 const c=config();if(!c)throw new ApiError(503,"WhatsApp não configurado.");
 if(!request.body)throw new ApiError(400,"Evento inválido.");
 const reader=request.body.getReader(),chunks:Uint8Array[]=[];let length=0;
 while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>256000){await reader.cancel();throw new ApiError(413,"Evento muito grande.");}chunks.push(value);}
 const raw=new Uint8Array(length);let offset=0;for(const chunk of chunks){raw.set(chunk,offset);offset+=chunk.length;}
 if(!await validMetaSignature(raw,request.headers.get("x-hub-signature-256"),c.appSecret))throw new ApiError(401,"Assinatura inválida.");
 let payload:unknown;try{payload=JSON.parse(new TextDecoder().decode(raw));}catch{throw new ApiError(400,"Evento inválido.");}
 await enqueueWhatsApp(database(),payload,c);
 // Acknowledge after durable storage; a separate processor sends replies.
 return json({received:true});
}catch(e){return fail(e);}}
