import {authorize,state,json,fail,body,ApiError} from "@/lib/server";
import {agentAnswer,STORES} from "@/lib/inventory";
export async function POST(request:Request){try{
 authorize(request,true);const input=await body(request);if(typeof input.message!=="string"||!input.message.trim()||input.message.length>500)throw new ApiError(400,"Escreva uma pergunta de até 500 caracteres.");
 const s=await state();const answer=agentAnswer(s.products,s.rule,input.message,s.connections.map(c=>c.id));
 const warnings=s.connections.filter(c=>!c.connected||c.error||!c.lastSync||!c.catalogReady);
 const dates=s.connections.filter(c=>c.lastSync&&c.catalogReady).map(c=>STORES.find(x=>x.id===c.id)!.name+": "+new Date(c.lastSync!).toLocaleString("pt-BR",{timeZone:"America/Sao_Paulo"}));
 return json({...answer,text:answer.text+(dates.length?"\n\nÚltima atualização (Brasília) · "+dates.join(" · "):"")+(!s.demo&&warnings.length?"\n\n**Atenção:** "+warnings.map(c=>STORES.find(x=>x.id===c.id)!.name+": "+(c.error||"catálogo aguardando atualização")).join(" · ")+". Os resultados podem estar incompletos ou desatualizados.":""),demo:s.demo,connections:s.connections});
}catch(e){return fail(e);}}
