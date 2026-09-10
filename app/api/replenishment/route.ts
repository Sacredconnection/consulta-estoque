import {authorize,state,database,json,fail,ApiError} from '@/lib/server';
import {sacredReplenishment,type SacredMinimum} from '@/lib/replenishment';
export async function GET(request:Request){try{
 authorize(request);
 const record=await database().prepare('SELECT payload FROM settings WHERE id=?').bind('sacred_minimums').first<{payload:string}>();
 if(!record)throw new ApiError(503,'Os mínimos da Sacred ainda não foram importados.');
 const config=JSON.parse(record.payload) as {source:string;items:SacredMinimum[]};
 const s=await state(),connection=s.connections.find(c=>c.id==='sacred');
 if(!connection||!connection.catalogReady||!connection.lastSync)throw new ApiError(503,'Sincronize a Sacred antes de gerar a reposição.');
 return json({generatedAt:new Date().toISOString(),lastSync:connection.lastSync,source:config.source,lines:sacredReplenishment(config.items,s.products),warning:connection.error?'A última atualização falhou. Revise a data do estoque antes de usar o pedido.':undefined});
}catch(e){return fail(e);}}
