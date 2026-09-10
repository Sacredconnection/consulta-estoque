import { createServer } from "node:http";
import { existsSync,readFileSync } from "node:fs";
import { parseEnv } from "node:util";
const values={...(existsSync(".env.local")?parseEnv(readFileSync(".env.local","utf8")):{}),...process.env};
const backend=new URL(values.WHATSAPP_BACKEND_ORIGIN||"http://localhost:3000");
if(backend.username||backend.password||backend.search||backend.hash||backend.pathname!=="/"||!(backend.protocol==="https:"||(backend.protocol==="http:"&&["localhost","127.0.0.1","[::1]"].includes(backend.hostname))))throw Error("Backend deve usar HTTPS ou localhost.");
const port=Number(values.WHATSAPP_RELAY_PORT||8788);
if(!Number.isSafeInteger(port)||port<1024||port>65535)throw Error("Porta do relay inválida.");
const server=createServer(async(req,res)=>{
 res.setHeader("Cache-Control","no-store");
 let url;try{url=new URL(req.url||"/","http://localhost");}catch{res.writeHead(400).end();return;}
 if(url.pathname!=="/webhooks/whatsapp"){res.writeHead(404).end();return;}
 if(req.method!=="GET"&&req.method!=="POST"){res.writeHead(405,{Allow:"GET, POST"}).end();return;}
 try{
  const chunks=[];let length=0;
  for await(const chunk of req){length+=chunk.length;if(length>256000){res.writeHead(413).end();return;}chunks.push(chunk);}
  const target=new URL("/api/whatsapp/webhook",backend);target.search=url.search;
  const signature=req.headers["x-hub-signature-256"];
  const headers={"Content-Type":"application/json",...(typeof signature==="string"?{"x-hub-signature-256":signature}:{})};
  const response=await fetch(target,{method:req.method,headers,body:req.method==="POST"?Buffer.concat(chunks):undefined,redirect:"manual",signal:AbortSignal.timeout(20000)});
  // Never expose private login redirects or upstream cookies through the relay.
  if(response.status>=300&&response.status<400){res.writeHead(502).end("Backend inacessível.");return;}
  res.writeHead(response.status,{"Content-Type":response.headers.get("content-type")||"text/plain"});
  res.end(await response.text());
 }catch{if(!res.headersSent)res.writeHead(502);res.end("Webhook indisponível.");}
});
server.requestTimeout=25000;server.headersTimeout=10000;
server.listen(port,"127.0.0.1",()=>console.log("Relay em http://127.0.0.1:"+port+"/webhooks/whatsapp · exponha somente esta porta por HTTPS."));
for(const signal of ["SIGINT","SIGTERM"])process.on(signal,()=>server.close());
