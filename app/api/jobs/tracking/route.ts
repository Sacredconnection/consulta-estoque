import {hasBearer} from '@/lib/bot-auth';
import {json,fail,ApiError} from '@/lib/server';
import {refreshTracking} from '@/lib/tracking-service';
export const runtime='nodejs';
export const maxDuration=240;
export async function GET(request:Request){try{
 if(!await hasBearer(request,process.env.CRON_SECRET))throw new ApiError(401,'Credencial de agendamento inválida.');
 const state=await refreshTracking();return json({enabled:state.enabled,rows:state.rows.length});
 }catch(e){return fail(e);}}
