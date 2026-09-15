import {authorize,body,json,fail,ApiError} from '@/lib/server';
import {configureTracking,importTracking,refreshTracking,trackingDashboard} from '@/lib/tracking-service';
export const runtime='nodejs';
export const maxDuration=240;
export async function GET(request:Request){try{authorize(request);return json(await trackingDashboard());}catch(e){return fail(e);}}
export async function POST(request:Request){try{
 authorize(request,true);
 if(request.headers.get('content-type')?.includes('multipart/form-data')){
  if(Number(request.headers.get('content-length')||0)>4*1024*1024)throw new ApiError(413,'A planilha deve ter até 4 MB.');
  const form=await request.formData(),file=form.get('file');
  if(!(file instanceof File)||!file.name.endsWith('.xlsx')||file.size>4*1024*1024)throw new ApiError(400,'Envie uma planilha .xlsx de até 4 MB.');
  await importTracking(Buffer.from(await file.arrayBuffer()),file.name);
 }else{
  const input=await body(request);
  if(input.action==='settings'){
   if(typeof input.enabled!=='boolean'||![5,15,30,60].includes(input.interval))throw new ApiError(400,'Configuração inválida.');
   await configureTracking(input.enabled,input.interval);
  }else if(input.action==='refresh'){
   if(input.id!==undefined&&(typeof input.id!=='string'||!/^[a-f0-9]{32}$/.test(input.id)))throw new ApiError(400,'Pedido inválido.');
   await refreshTracking(true,input.id);
  }else throw new ApiError(400,'Ação inválida.');
 }
 return json(await trackingDashboard());
 }catch(e){return fail(e);}}
