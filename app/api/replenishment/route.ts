import {authorize,state,database,json,fail,ApiError} from '@/lib/server';
import {sacredReplenishment,type SacredMinimum} from '@/lib/replenishment';
import {STORES} from '@/lib/inventory';
export async function GET(request:Request){try{
 authorize(request);
 const id=new URL(request.url).searchParams.get('storeId')??'sacred';
 const store=STORES.find(s=>s.id===id);if(!store)throw new ApiError(400,'Empresa inválida.');
 const s=await state(),connection=s.connections.find(c=>c.id===store.id);
 if(!connection)throw new ApiError(400,'A empresa selecionada não possui integração configurada.');
 const base={generatedAt:new Date().toISOString(),lastSync:connection.lastSync,storeId:store.id,storeName:store.short};
 const record=await database().prepare('SELECT payload FROM settings WHERE id=?').bind(store.id+'_minimums').first<{payload:string}>();
 if(!record)return json({...base,source:'',configured:false,lines:[]});
 const config=JSON.parse(record.payload) as {source:string;items:SacredMinimum[]};
 if(!connection.catalogReady||!connection.lastSync)throw new ApiError(503,'Sincronize a empresa selecionada antes de gerar a reposição.');
 return json({...base,configured:true,source:config.source,lines:sacredReplenishment(config.items,s.products,store.id),warning:connection.error?'A última atualização falhou. Revise a data do estoque antes de usar o pedido.':undefined});
}catch(e){return fail(e);}}
