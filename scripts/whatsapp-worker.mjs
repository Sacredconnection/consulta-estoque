import { existsSync,readFileSync } from "node:fs";
import { parseEnv } from "node:util";
const values={...(existsSync(".env.local")?parseEnv(readFileSync(".env.local","utf8")):{}),...process.env};
const origin=new URL(values.WHATSAPP_BACKEND_ORIGIN||"http://localhost:3000");
if(origin.username||origin.password||origin.search||origin.hash||origin.pathname!=="/"||!(origin.protocol==="https:"||(origin.protocol==="http:"&&["localhost","127.0.0.1","[::1]"].includes(origin.hostname))))throw Error("Backend deve usar HTTPS ou localhost.");
if(!values.WHATSAPP_JOB_TOKEN||values.WHATSAPP_JOB_TOKEN.length<32)throw Error("Configure WHATSAPP_JOB_TOKEN no .env.local (mínimo de 32 caracteres).");
const headers={Authorization:"Bearer "+values.WHATSAPP_JOB_TOKEN};
let stopping=false;process.on("SIGINT",()=>{stopping=true;});process.on("SIGTERM",()=>{stopping=true;});
console.log("Processador de respostas iniciado. Ctrl+C para encerrar.");
do{
 try{
  const r=await fetch(new URL("/api/jobs/whatsapp",origin),{method:"POST",headers,redirect:"error",signal:AbortSignal.timeout(60000)});
  if(!r.ok)throw Error("HTTP "+r.status);
  const result=await r.json();
  if(result.processed)console.log("Resposta: "+result.status+(result.part?" · parte "+result.part+"/"+result.total:""));
  if(process.argv.includes("--once"))break;
  await new Promise(resolve=>setTimeout(resolve,result.processed?300:2000));
 }catch(e){console.error("Processamento indisponível: "+(e instanceof Error&&/^HTTP \d+$/.test(e.message)?e.message:"verifique o backend."));
  if(process.argv.includes("--once")){process.exitCode=1;break;}await new Promise(resolve=>setTimeout(resolve,5000));
 }
}while(!stopping);
