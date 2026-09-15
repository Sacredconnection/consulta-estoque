import {authorize,json,fail,ApiError} from '@/lib/server';
import {trackingHistory} from '@/lib/tracking-service';
export const runtime='nodejs';
export async function GET(request:Request){try{
 authorize(request);
 const params=new URL(request.url).searchParams;
 const shipmentId=params.get('shipmentId')||undefined,tracking=params.get('tracking')||undefined,order=params.get('order')||undefined;
 const limit=params.has('limit')?Number(params.get('limit')):50,before=params.has('before')?Number(params.get('before')):undefined;
 if((shipmentId&&shipmentId.length>100)||(tracking&&tracking.length>100)||(order&&order.length>300)||!Number.isSafeInteger(limit)||limit<1||limit>200||(before!==undefined&&(!Number.isSafeInteger(before)||before<1)))throw new ApiError(400,'Filtros de histórico inválidos.');
 return json(await trackingHistory({shipmentId,tracking,order,limit,before}));
 }catch(error){return fail(error);}}
