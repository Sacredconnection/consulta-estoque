import { state, ApiError } from "./server";
import { agentAnswer, STORES } from "./inventory";
import {filterCategory} from './category-filter';

// One inventory answer shared by the website and messaging integrations.
export async function queryStock(message:unknown,storeIds?:unknown,category?:unknown){
 if(typeof message!=="string"||!message.trim()||message.length>500)throw new ApiError(400,"Escreva uma pergunta de até 500 caracteres.");
 if(storeIds!==undefined&&(!Array.isArray(storeIds)||!storeIds.length||storeIds.some(id=>!STORES.some(store=>store.id===id))))throw new ApiError(400,"Selecione pelo menos uma empresa válida.");
 const s=await state();
 const selected=s.connections.filter(c=>storeIds===undefined||(storeIds as unknown[]).includes(c.id));
 if(storeIds!==undefined&&!selected.length)throw new ApiError(400,"Nenhuma empresa selecionada está configurada.");
 if(category!==undefined&&(typeof category!=='string'||!category.trim()||category.length>200||selected.length!==1||!Array.isArray(storeIds)||storeIds.length!==1))throw new ApiError(400,'Selecione apenas uma empresa para filtrar por categoria.');
 const products=typeof category==='string'?filterCategory(s.products,selected[0].id,category):s.products;
 const answer=agentAnswer(products,s.rule,message,selected.map(c=>c.id));
 const warnings=selected.filter(c=>!c.connected||c.error||!c.lastSync||!c.catalogReady);
 const dates=selected.filter(c=>c.lastSync&&c.catalogReady).map(c=>STORES.find(x=>x.id===c.id)!.name+": "+new Date(c.lastSync!).toLocaleString("pt-BR",{timeZone:"America/Sao_Paulo"}));
 return {...answer,text:answer.text+(dates.length?"\n\nÚltima atualização (Brasília) · "+dates.join(" · "):"")+(warnings.length?"\n\n**Atenção:** "+warnings.map(c=>STORES.find(x=>x.id===c.id)!.name+": "+(c.error||"catálogo aguardando atualização")).join(" · ")+". Os resultados podem estar incompletos ou desatualizados.":""),demo:false,connections:s.connections};
}
