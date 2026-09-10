import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { once } from "node:events";
test("webhook relay forwards original signed body and exposes no other application routes",async()=>{
 let captured;
 const upstream=createServer(async(req,res)=>{const chunks=[];for await(const chunk of req)chunks.push(chunk);captured={url:req.url,signature:req.headers["x-hub-signature-256"],body:Buffer.concat(chunks).toString()};res.setHeader("Content-Type","application/json");res.end('{"received":true}');});
 upstream.listen(0,"127.0.0.1");await once(upstream,"listening");
 const reservation=createServer();reservation.listen(0,"127.0.0.1");await once(reservation,"listening");const port=reservation.address().port;await new Promise(r=>reservation.close(r));
 const child=spawn(process.execPath,["scripts/whatsapp-relay.mjs"],{stdio:["ignore","pipe","pipe"],windowsHide:true,env:{...process.env,WHATSAPP_BACKEND_ORIGIN:"http://127.0.0.1:"+upstream.address().port,WHATSAPP_RELAY_PORT:String(port)}});
 try{
  await Promise.race([once(child.stdout,"data"),once(child,"exit").then(()=>{throw Error("Relay exited before listening");}),new Promise((_,reject)=>{const t=setTimeout(()=>reject(Error("Relay timeout")),10000);t.unref();})]);
  const url="http://127.0.0.1:"+port;
  const raw='{"example": "raw body with spaces 🌿"}';
  const response=await fetch(url+"/webhooks/whatsapp",{method:"POST",headers:{"x-hub-signature-256":"sha256=test"},body:raw});
  assert.equal(response.status,200);assert.deepEqual(captured,{url:"/api/whatsapp/webhook",signature:"sha256=test",body:raw});
  assert.equal((await fetch(url+"/api/inventory")).status,404);
  assert.equal((await fetch(url+"/signin-with-chatgpt")).status,404);
  assert.equal((await fetch(url+"/webhooks/whatsapp",{method:"DELETE"})).status,405);
  assert.equal((await fetch(url+"/webhooks/whatsapp?hub.challenge=123")).status,200);
  assert.equal(captured.url,"/api/whatsapp/webhook?hub.challenge=123");
 }finally{child.kill();await new Promise(r=>upstream.close(r));}
});
