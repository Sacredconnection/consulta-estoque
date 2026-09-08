import { env } from "cloudflare:workers";
import { json, fail, getRule, database, synchronize, ApiError } from "@/lib/server";
export async function POST(request:Request){
 try{
  // This route is also behind the private Sites gateway. Its separate token is sync-only.
  const expected=(env as unknown as {SYNC_JOB_TOKEN?:string}).SYNC_JOB_TOKEN;
  const supplied=request.headers.get("Authorization")?.replace(/^Bearer /,"");
  if(!expected||!supplied)throw new ApiError(401,"Credencial de agendamento inválida.");
  const digest=async(s:string)=>new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s)));
  const [a,b]=await Promise.all([digest(expected),digest(supplied)]);
  let mismatch=0;for(let i=0;i<a.length;i++)mismatch|=a[i]^b[i];
  if(mismatch)throw new ApiError(401,"Credencial de agendamento inválida.");
  const rule=await getRule();if(!rule.enabled)return json({skipped:true,reason:"Monitoramento pausado."});
  const latest=await database().prepare("SELECT payload FROM settings WHERE id=?").bind("last_job_success").first<{payload:string}>();
  if(latest&&Date.now()-Number(latest.payload)<rule.interval*60000)return json({skipped:true,reason:"Intervalo mínimo ainda não atingido."});
  const results=await synchronize();
  if(results.every(r=>r.ok))await database().prepare("INSERT INTO settings (id,payload) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload").bind("last_job_success",String(Date.now())).run();
  return json({results},results.every(r=>r.ok)?200:502);
 }catch(e){return fail(e);}
}
