export const runtime="nodejs";
export const maxDuration=60;
import { database,json,fail,ApiError } from "@/lib/server";
import { hasBearer } from "@/lib/bot-auth";
import { whatsappConfig } from "@/lib/whatsapp-meta";
import { processWhatsApp } from "@/lib/whatsapp-queue";
import { queryStock } from "@/lib/query-service";
import type { EnvironmentValues } from "@/lib/connections-env";
export async function POST(request:Request){try{
 const values=process.env as EnvironmentValues;
 if(!await hasBearer(request,values.WHATSAPP_JOB_TOKEN))throw new ApiError(401,"Token do processador inválido.");
 const c=whatsappConfig(values);if(!c)throw new ApiError(503,"WhatsApp não configurado.");
 return json(await processWhatsApp(database(),c,queryStock));
}catch(e){return fail(e);}}
