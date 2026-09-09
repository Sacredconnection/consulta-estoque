import { createHmac, createHash, timingSafeEqual } from 'node:crypto';
import type { StoreId } from './inventory';

export function validStockNotification(storeId:StoreId,headers:Headers,body:Uint8Array,env:Record<string,string|undefined>=process.env):boolean{
 if(storeId==='pagnier'){
  const expected=env.PAGNIER_CHANGE_TOKEN;
  const supplied=headers.get('authorization')?.replace(/^Bearer /,'');
  if(!expected||!supplied)return false;
  const hash=(s:string)=>createHash('sha256').update(s).digest();
  return timingSafeEqual(hash(expected),hash(supplied));
 }
 const secret=env['WOO_'+storeId.toUpperCase()+'_WEBHOOK_SECRET'];
 const signature=headers.get('x-wc-webhook-signature');
 if(!secret||!signature)return false;
 const expected=createHmac('sha256',secret).update(body).digest();
 const supplied=Buffer.from(signature,'base64');
 return supplied.length===expected.length&&timingSafeEqual(supplied,expected);
}
