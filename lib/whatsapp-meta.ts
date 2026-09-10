import type { EnvironmentValues } from "./connections-env";

export type WhatsAppConfig={verifyToken:string;appSecret:string;accessToken:string;phoneNumberId:string;graphVersion:string;allowedNumbers:Set<string>;sendEnabled:boolean};
export function whatsappConfig(values:EnvironmentValues):WhatsAppConfig|null{
 if(values.WHATSAPP_PROVIDER!=="meta")return null;
 const verifyToken=values.WHATSAPP_VERIFY_TOKEN?.trim(),appSecret=values.WHATSAPP_APP_SECRET?.trim(),phoneNumberId=values.WHATSAPP_PHONE_NUMBER_ID?.trim();
 if(!verifyToken||verifyToken.length<32||!appSecret||!phoneNumberId||!/^\d{5,30}$/.test(phoneNumberId))return null;
 const numbers=(values.WHATSAPP_ALLOWED_NUMBERS??"").split(",").map(s=>s.trim().replace(/^\+/,"")).filter(Boolean);
 if(!numbers.length||numbers.some(n=>!/^[1-9]\d{7,14}$/.test(n)))return null;
 return {verifyToken,appSecret,phoneNumberId,accessToken:values.WHATSAPP_ACCESS_TOKEN?.trim()??"",graphVersion:values.WHATSAPP_GRAPH_VERSION?.trim()??"",allowedNumbers:new Set(numbers),sendEnabled:values.WHATSAPP_SEND_ENABLED==="true"};
}
export async function validMetaSignature(raw:Uint8Array,signature:string|null,secret:string){
 if(!signature||!/^sha256=[a-f0-9]{64}$/.test(signature)||!secret)return false;
 const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["verify"]);
 const bytes=Uint8Array.from(signature.slice(7).match(/../g)!,x=>parseInt(x,16));
 return crypto.subtle.verify("HMAC",key,bytes,raw as Uint8Array<ArrayBuffer>);
}
export type IncomingMessage={id:string;from:string;question:string;receivedAt:number};
const object=(x:unknown):Record<string,unknown>=>x!==null&&typeof x==="object"&&!Array.isArray(x)?x as Record<string,unknown>:{};
const list=(x:unknown):unknown[]=>Array.isArray(x)?x:[];
export function incomingMessages(payload:unknown,config:WhatsAppConfig,now=Date.now()):IncomingMessage[]{
 const root=object(payload);if(root.object!=="whatsapp_business_account")return [];
 const result:IncomingMessage[]=[];
 for(const entry of list(root.entry))for(const change of list(object(entry).changes)){
  const c=object(change),value=object(c.value);
  if(c.field!=="messages"||object(value.metadata).phone_number_id!==config.phoneNumberId)continue;
  for(const item of list(value.messages)){
   const m=object(item),from=m.from,id=m.id,seconds=Number(m.timestamp);
   if(typeof from!=="string"||!config.allowedNumbers.has(from)||typeof id!=="string"||id.length>200||!id.length)continue;
   const receivedAt=seconds*1000;
   if(!Number.isSafeInteger(receivedAt)||receivedAt>now+300000||now-receivedAt>23*3600000)continue;
   const text=object(m.text).body;
   // Non-text/long messages receive a short instruction, never a guessed query.
   const question=m.type==="text"&&typeof text==="string"&&text.trim()&&text.length<=500?text.trim():"";
   result.push({id:config.phoneNumberId+":"+id,from,question,receivedAt});
  }
 }
 return result;
}
export class WhatsAppSendError extends Error {
 constructor(message:string,public retryable:boolean){super(message);}
}
export async function sendWhatsAppText(config:WhatsAppConfig,to:string,text:string,request:typeof fetch=fetch){
 if(!config.sendEnabled||!config.accessToken||!/^v\d+\.\d+$/.test(config.graphVersion))throw new WhatsAppSendError("Envio não configurado.",false);
 if(!config.allowedNumbers.has(to)||!text||text.length>4096)throw new WhatsAppSendError("Destinatário ou mensagem inválida.",false);
 let response:Response;
 try{response=await request("https://graph.facebook.com/"+config.graphVersion+"/"+config.phoneNumberId+"/messages",{method:"POST",headers:{Authorization:"Bearer "+config.accessToken,"Content-Type":"application/json"},redirect:"manual",signal:AbortSignal.timeout(15000),body:JSON.stringify({messaging_product:"whatsapp",recipient_type:"individual",to,type:"text",text:{preview_url:false,body:text}})});}
 catch{throw new WhatsAppSendError("Falha de comunicação com o WhatsApp.",true);}
 const data=await response.json().catch(()=>null) as {error?:{code?:unknown};messages?:{id?:unknown}[]}|null;
 if(!response.ok){
  const code=typeof data?.error?.code==="number"&&Number.isSafeInteger(data.error.code)?" · código "+data.error.code:"";
  throw new WhatsAppSendError("WhatsApp HTTP "+response.status+code,response.status===429||response.status>=500);
 }
 const id=data?.messages?.[0]?.id;
 if(typeof id!=="string"||!id.length||id.length>300)throw new WhatsAppSendError("Resposta de envio inválida.",true);
 return id;
}
