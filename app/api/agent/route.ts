import {authorize,state,json,fail,body,ApiError} from "@/lib/server";
import {agentAnswer} from "@/lib/inventory";
export async function POST(request:Request){try{
 authorize(request,true);const input=await body(request);if(typeof input.message!=="string"||!input.message.trim()||input.message.length>500)throw new ApiError(400,"Escreva uma pergunta de até 500 caracteres.");
 const s=await state();const answer=agentAnswer(s.products,s.rule,input.message,s.connections.map(c=>c.id));
 const warnings=s.connections.filter(c=>!c.connected||c.error||!c.lastSync);
 return json({...answer,text:answer.text+(!s.demo&&warnings.length?" Atenção: há lojas sem conexão, sem sincronização ou com erro. Confira Conexões; dados anteriores podem estar desatualizados.":""),demo:s.demo,connections:s.connections});
}catch(e){return fail(e);}}
