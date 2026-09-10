import { state, ApiError } from "./server";
import { agentAnswer, STORES } from "./inventory";

// One inventory answer shared by the website and messaging integrations.
export async function queryStock(message:unknown){
 if(typeof message!=="string"||!message.trim()||message.length>500)throw new ApiError(400,"Escreva uma pergunta de até 500 caracteres.");
 const s=await state();
 const answer=agentAnswer(s.products,s.rule,message,s.connections.map(c=>c.id));
 const warnings=s.connections.filter(c=>!c.connected||c.error||!c.lastSync||!c.catalogReady);
 const dates=s.connections.filter(c=>c.lastSync&&c.catalogReady).map(c=>STORES.find(x=>x.id===c.id)!.name+": "+new Date(c.lastSync!).toLocaleString("pt-BR",{timeZone:"America/Sao_Paulo"}));
 return {...answer,text:answer.text+(dates.length?"\n\nÚltima atualização (Brasília) · "+dates.join(" · "):"")+(warnings.length?"\n\n**Atenção:** "+warnings.map(c=>STORES.find(x=>x.id===c.id)!.name+": "+(c.error||"catálogo aguardando atualização")).join(" · ")+". Os resultados podem estar incompletos ou desatualizados.":""),demo:false,connections:s.connections};
}
