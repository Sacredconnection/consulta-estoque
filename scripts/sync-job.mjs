const {SITE_ORIGIN,SITES_GATEWAY_TOKEN,SYNC_JOB_TOKEN}=process.env;
if(!SITE_ORIGIN||!SITES_GATEWAY_TOKEN||!SYNC_JOB_TOKEN){console.error("Configure as variáveis do agendador no cofre de segredos.");process.exit(1);}
const url=new URL("/api/jobs/sync",SITE_ORIGIN);if(url.protocol!=="https:")throw Error("Use HTTPS.");
async function call(input){
 const r=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json","OAI-Sites-Authorization":"Bearer "+SITES_GATEWAY_TOKEN,Authorization:"Bearer "+SYNC_JOB_TOKEN},body:JSON.stringify(input),redirect:"error",signal:AbortSignal.timeout(60000)});
 if(!r.ok)throw Error("HTTP "+r.status);return r.json();
}
try{
 let result=await call({action:"start"});let iterations=0;
 if(result.skipped){console.log("Consulta adiada pela regra de monitoramento.");process.exit(0);}
 while(result.connections.some(c=>c.sync?.status==="running")){
  if(++iterations>5000)throw Error("Limite de etapas do agendador atingido; o progresso foi preservado.");
  // Serial store advancement gives each response a consistent combined status.
  for(const c of result.connections.filter(c=>c.sync?.status==="running")){
   result=await call({action:"step",storeId:c.id,runId:c.sync.runId});
   if(result.busy)await new Promise(resolve=>setTimeout(resolve,1000));
  }
 }
 if(result.connections.some(c=>c.sync?.status==="failed"))throw Error("Uma ou mais lojas falharam. Consulte o painel.");
 console.log("Sincronização concluída.");
}catch(e){console.error("Sincronização interrompida: "+e.message);process.exitCode=1;}
