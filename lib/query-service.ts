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
 const categories=category===undefined?[]:Array.isArray(category)?category:[category];
 if(categories.length>50||categories.some(c=>typeof c!=='string'||!c.trim()||c.length>200))throw new ApiError(400,'Informe até 50 categorias válidas.');
 if(categories.length&&(selected.length!==1||!Array.isArray(storeIds)||storeIds.length!==1))throw new ApiError(400,'Selecione apenas uma empresa para filtrar por categoria.');
 const products=categories.length?filterCategory(s.products,selected[0].id,categories):s.products;
 const answer=agentAnswer(products,s.rule,message,selected.map(c=>c.id));
 const warnings=selected.filter(c=>!c.connected||c.error||!c.lastSync||!c.catalogReady);
 const dates=selected.filter(c=>c.lastSync&&c.catalogReady).map(c=>STORES.find(x=>x.id===c.id)!.name+": "+new Date(c.lastSync!).toLocaleString("pt-BR",{timeZone:"America/Sao_Paulo"}));
 return {...answer,text:answer.text+(dates.length?"\n\nÚltima atualização (Brasília) · "+dates.join(" · "):"")+(warnings.length?"\n\n**Atenção:** "+warnings.map(c=>STORES.find(x=>x.id===c.id)!.name+": "+(c.error||"catálogo aguardando atualização")).join(" · ")+". Os resultados podem estar incompletos ou desatualizados.":""),demo:false,connections:s.connections};
}
