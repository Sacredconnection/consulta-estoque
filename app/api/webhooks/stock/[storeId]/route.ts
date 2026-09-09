import { STORES } from '@/lib/inventory';
import { database, json, fail, ApiError } from '@/lib/server';
import { validStockNotification } from '@/lib/stock-notifications';

export const runtime='nodejs';
export async function POST(request:Request,{params}:{params:Promise<{storeId:string}>}){
 try{
  const {storeId}=await params;
  const store=STORES.find(s=>s.id===storeId);
  if(!store)throw new ApiError(404,'Fonte desconhecida.');
  const chunks:Uint8Array[]=[];let length=0;
  const reader=request.body?.getReader();
  if(reader)while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>512000){await reader.cancel();throw new ApiError(413,'Notificação muito grande.');}chunks.push(value);}
  const raw=Buffer.concat(chunks);
  // WooCommerce's initial unsigned connectivity ping never changes the cache.
  if(store.id!=='pagnier'&&!request.headers.has('x-wc-webhook-signature')&&request.headers.get('content-type')?.includes('application/x-www-form-urlencoded')&&/^webhook_id=\d+$/.test(raw.toString()))return json({received:true,ping:true});
  if(!validStockNotification(store.id,request.headers,raw))throw new ApiError(401,'Assinatura de alteração inválida.');
  await database().prepare("INSERT INTO connections (id,credentials,source_revision) VALUES (?, 'environment', 1) ON CONFLICT(id) DO UPDATE SET source_revision=connections.source_revision+1").bind(store.id).run();
  return json({received:true,storeId:store.id,cacheInvalidated:true});
 }catch(error){return fail(error);}
}
