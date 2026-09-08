// Run from a secure cron runner. No credentials are printed.
const {SITE_ORIGIN,SITES_GATEWAY_TOKEN,SYNC_JOB_TOKEN}=process.env;
if(!SITE_ORIGIN||!SITES_GATEWAY_TOKEN||!SYNC_JOB_TOKEN){
 console.error("Configure SITE_ORIGIN, SITES_GATEWAY_TOKEN e SYNC_JOB_TOKEN no cofre do agendador.");process.exit(1);
}
const url=new URL("/api/jobs/sync",SITE_ORIGIN);
if(url.protocol!=="https:")throw new Error("A origem deve usar HTTPS.");
try{
 const r=await fetch(url,{method:"POST",headers:{"OAI-Sites-Authorization":"Bearer "+SITES_GATEWAY_TOKEN,Authorization:"Bearer "+SYNC_JOB_TOKEN},redirect:"error",signal:AbortSignal.timeout(180000)});
 if(!r.ok){console.error("Sincronização não concluída. HTTP "+r.status);process.exitCode=1;}
 else{const data=await r.json();console.log(data.skipped?"Sincronização adiada pelo intervalo ou pausa.":"Sincronização concluída.");}
}catch{console.error("O agendador não conseguiu acessar o sistema.");process.exitCode=1;}
