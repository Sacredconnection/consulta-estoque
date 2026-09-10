import type { InventoryDatabase } from "./database";
import { incomingMessages, sendWhatsAppText, WhatsAppSendError, type WhatsAppConfig } from "./whatsapp-meta";
import { whatsappMessages } from "./whatsapp-format";
type Job={id:string;from_number:string;question:string;received_at:number;reply:string|null;next_part:number;attempts:number};
export async function enqueueWhatsApp(db:InventoryDatabase,payload:unknown,config:WhatsAppConfig,now=Date.now()){
 const messages=incomingMessages(payload,config,now);
 if(!messages.length)return 0;
 const results=await db.batch(messages.map(m=>db.prepare("INSERT INTO whatsapp_messages (id,from_number,question,received_at,created_at,updated_at,available_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING").bind(m.id,m.from,m.question,m.receivedAt,now,now,now)));
 return results.reduce((n,r)=>n+r.meta.changes,0);
}
export async function processWhatsApp(db:InventoryDatabase,config:WhatsAppConfig,answer:(question:string)=>Promise<{text:string}>,send:typeof sendWhatsAppText=sendWhatsAppText,now=Date.now()){
 if(!config.sendEnabled||!config.accessToken||!/^v\d+\.\d+$/.test(config.graphVersion))return {processed:false,reason:"Envio desativado ou incompleto."};
 const token=crypto.randomUUID();
 // Atomic claim prevents two processors from sending the same pending part together.
 const job=await db.prepare("UPDATE whatsapp_messages SET lease_token=?,lease_until=?,status='processing',updated_at=? WHERE id=(SELECT candidate.id FROM whatsapp_messages candidate WHERE candidate.status IN ('pending','processing') AND candidate.available_at<=? AND candidate.lease_until<? AND NOT EXISTS (SELECT 1 FROM whatsapp_messages earlier WHERE earlier.from_number=candidate.from_number AND earlier.status IN ('pending','processing') AND earlier.rowid<candidate.rowid) ORDER BY candidate.available_at,candidate.created_at LIMIT 1) RETURNING id,from_number,question,received_at,reply,next_part,attempts")
  .bind(token,now+90000,now,now,now).first<Job>();
 if(!job){
  await db.prepare("DELETE FROM whatsapp_messages WHERE status IN ('sent','failed','expired') AND updated_at<?").bind(now-7*86400000).run();
  return {processed:false,reason:"Nenhuma mensagem disponível."};
 }
 const update=async(status:string,error:string|null=null)=>db.prepare("UPDATE whatsapp_messages SET status=?,last_error=?,lease_token=NULL,lease_until=0,updated_at=? WHERE id=? AND lease_token=?").bind(status,error,Date.now(),job.id,token).run();
 if(!config.allowedNumbers.has(job.from_number)||now-job.received_at>=23*3600000){await update("expired","Consulta expirada ou número não autorizado.");return {processed:true,status:"expired"};}
 try{
  let parts:string[];
  if(job.reply)parts=JSON.parse(job.reply);
  else{
   const result=job.question?await answer(job.question):{text:"Envie o nome ou SKU do produto em uma mensagem de texto de até 500 caracteres. Exemplo: estoque de Tsunu."};
   parts=whatsappMessages(result.text);
   // Avoid turning a broad query into hundreds of unsolicited message parts.
   if(parts.length>8)parts=["A consulta encontrou muitos resultados. Informe um produto ou SKU mais específico e, se desejar, o nome da loja. Exemplo: estoque de Tsunu na Maya."];
   if(!parts.length)parts=["Não foi possível montar a resposta. Tente informar o nome ou SKU do produto."];
   const saved=await db.prepare("UPDATE whatsapp_messages SET reply=?,updated_at=? WHERE id=? AND lease_token=?").bind(JSON.stringify(parts),Date.now(),job.id,token).run();
   if(!saved.meta.changes)return {processed:false,reason:"Etapa assumida por outro processo."};
  }
  // Recheck lease and reply window immediately before an external side effect.
  const owned=await db.prepare("SELECT id FROM whatsapp_messages WHERE id=? AND lease_token=? AND lease_until>?").bind(job.id,token,Date.now()+20000).first();
  if(!owned)return {processed:false,reason:"Etapa expirada; será retomada."};
  if(Date.now()-job.received_at>=23*3600000){await update("expired");return {processed:true,status:"expired"};}
  const id=await send(config,job.from_number,parts[job.next_part]);
  const finished=job.next_part+1>=parts.length;
  await db.prepare("UPDATE whatsapp_messages SET next_part=next_part+1,status=?,attempts=0,last_error=NULL,last_message_id=?,lease_token=NULL,lease_until=0,available_at=?,updated_at=? WHERE id=? AND lease_token=?")
   .bind(finished?"sent":"pending",id,Date.now(),Date.now(),job.id,token).run();
  return {processed:true,status:finished?"sent":"pending",part:job.next_part+1,total:parts.length};
 }catch(error){
  const message=error instanceof WhatsAppSendError?error.message:"Falha ao preparar a resposta.";
  const retryable=!(error instanceof WhatsAppSendError)||error.retryable;
  const attempts=job.attempts+1,status=retryable&&attempts<5?"pending":"failed";
  await db.prepare("UPDATE whatsapp_messages SET status=?,attempts=?,last_error=?,available_at=?,lease_token=NULL,lease_until=0,updated_at=? WHERE id=? AND lease_token=?")
   .bind(status,attempts,message,Date.now()+Math.min(15*60000,30000*2**(attempts-1)),Date.now(),job.id,token).run();
  return {processed:true,status,error:message};
 }
}
