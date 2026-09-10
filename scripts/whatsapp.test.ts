import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { createHmac } from "node:crypto";
import { whatsappConfig,incomingMessages,validMetaSignature,sendWhatsAppText,WhatsAppSendError,type WhatsAppConfig } from "../lib/whatsapp-meta";
import { whatsappMessages } from "../lib/whatsapp-format";
import { enqueueWhatsApp,processWhatsApp } from "../lib/whatsapp-queue";
import { hasBearer } from "../lib/bot-auth";
import type { InventoryDatabase } from "../lib/database";
import { setTestDatabase } from "./test-database";
const env=process.env;
import { GET as verifyWebhook,POST as webhook } from "../app/api/whatsapp/webhook/route";
import { POST as botQuery } from "../app/api/bot/query/route";
import { POST as processRoute } from "../app/api/jobs/whatsapp/route";
import { toRecord } from "../lib/woo";

const values={WHATSAPP_PROVIDER:"meta",WHATSAPP_VERIFY_TOKEN:"verify-".padEnd(40,"a"),WHATSAPP_APP_SECRET:"test-app-secret",WHATSAPP_ACCESS_TOKEN:"test-access-token",WHATSAPP_PHONE_NUMBER_ID:"123456789",WHATSAPP_GRAPH_VERSION:"v25.0",WHATSAPP_ALLOWED_NUMBERS:"5511999999999",WHATSAPP_SEND_ENABLED:"true"};
const config=whatsappConfig(values)!;
function payload(id="wamid.test",question="estoque de Tsunu",from="5511999999999",timestamp=String(Math.floor(Date.now()/1000))){
 return {object:"whatsapp_business_account",entry:[{changes:[{field:"messages",value:{metadata:{phone_number_id:config.phoneNumberId},messages:[{id,from,type:"text",text:{body:question},timestamp}]}}]}]};
}
function database(){
 const sqlite=new DatabaseSync(":memory:");
 for(const name of ["0000_free_cerebro","0001_puzzling_goliath","0002_persistent_cache","0003_whatsapp_queue"])sqlite.exec(readFileSync("drizzle/"+name+".sql","utf8"));
 function prepare(sql:string,values:unknown[]=[]):any{
  return {bind:(...next:unknown[])=>prepare(sql,next),first:async()=>sqlite.prepare(sql).get(...values as any[])??null,
   all:async()=>({results:sqlite.prepare(sql).all(...values as any[])}),
   run:async()=>{const r=sqlite.prepare(sql).run(...values as any[]);return {meta:{changes:Number(r.changes)},success:true};}};
 }
 const db={prepare,batch:async(statements:any[])=>{sqlite.exec("BEGIN");try{const r=await Promise.all(statements.map(s=>s.run()));sqlite.exec("COMMIT");return r;}catch(e){sqlite.exec("ROLLBACK");throw e;}}} as unknown as InventoryDatabase;
 return {db,sqlite};
}
const answer=async()=>({text:"## Maya Herbs\n**Granel (atacado)**\n- 250gr: **14 un.** × 0,25 kg = **3,5 kg**"});

test("WhatsApp formatting preserves kg and splits Unicode without exceeding API limits",()=>{
 const short=whatsappMessages((awaitableText()));assert.match(short[0],/\*Maya Herbs\*/);assert.match(short[0],/\*3,5 kg\*/);assert.doesNotMatch(short[0],/##|\*\*/);
 const long=whatsappMessages("🌿".repeat(6000));assert.ok(long.length>1);assert.ok(long.every(s=>s.length<=4096&&!s.includes("\uFFFD")));
 assert.equal(long.map(s=>s.replace(/^\(\d+\/\d+\)\n/,"")).join(""),"🌿".repeat(6000));
 function awaitableText(){return "## Maya Herbs\n**Granel (atacado)**\n- 250gr: **3,5 kg**";}
});
test("bot bearer tokens and server environment are explicit and fail closed",async()=>{
 const token="a".repeat(40);
 assert.equal(await hasBearer(new Request("http://local",{headers:{Authorization:"Bearer "+token}}),token),true);
 assert.equal(await hasBearer(new Request("http://local",{headers:{Authorization:"Bearer wrong"}}),token),false);
 assert.equal(await hasBearer(new Request("http://local"),undefined),false);
 assert.equal(whatsappConfig({...values,WHATSAPP_ALLOWED_NUMBERS:""}),null);
 assert.equal(whatsappConfig({...values,WHATSAPP_PROVIDER:"evolution"}),null);
});
test("Meta signature validates raw body and rejects tampering",async()=>{
 const raw=new TextEncoder().encode(JSON.stringify(payload()));
 const signature="sha256="+createHmac("sha256",config.appSecret).update(raw).digest("hex");
 assert.equal(await validMetaSignature(raw,signature,config.appSecret),true);
 assert.equal(await validMetaSignature(new TextEncoder().encode("{}"),signature,config.appSecret),false);
 assert.equal(await validMetaSignature(raw,null,config.appSecret),false);
});
test("inbound parser limits callers, business number, message age and unsupported content",()=>{
 assert.equal(incomingMessages(payload(),config).length,1);
 assert.equal(incomingMessages(payload("x","Tsunu","5511888888888"),config).length,0);
 assert.equal(incomingMessages(payload("x","Tsunu",undefined,"1"),config).length,0);
 assert.equal(incomingMessages(payload(),{...config,phoneNumberId:"other"}).length,0);
 assert.equal(incomingMessages({object:"whatsapp_business_account",entry:[{changes:[{field:"messages",value:{statuses:[{id:"x"}]}}]}]},config).length,0);
 assert.equal(incomingMessages(payload("x","x".repeat(501)),config)[0].question,"");
});
test("webhook challenge, signature and duplicate deliveries enqueue only once",async()=>{
 const {db,sqlite}=database();try{
  setTestDatabase(db);Object.assign(env,values);
  const challenge=await verifyWebhook(new Request("http://local/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token="+values.WHATSAPP_VERIFY_TOKEN+"&hub.challenge=123"));
  assert.equal(challenge.status,200);assert.equal(await challenge.text(),"123");
  assert.equal((await verifyWebhook(new Request("http://local/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=123"))).status,403);
  const raw=JSON.stringify(payload());const signature="sha256="+createHmac("sha256",config.appSecret).update(raw).digest("hex");
  const request=()=>new Request("http://local/api/whatsapp/webhook",{method:"POST",headers:{"x-hub-signature-256":signature},body:raw});
  assert.equal((await webhook(new Request("http://local",{method:"POST",body:raw}))).status,401);
  assert.equal((await webhook(request())).status,200);assert.equal((await webhook(request())).status,200);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM whatsapp_messages").get()!.n,1);
 }finally{sqlite.close();for(const k of [...Object.keys(values),"BOT_API_TOKEN","WOO_MAYA_KEY","WOO_MAYA_SECRET"])delete env[k];setTestDatabase(undefined);}
});
test("generic bot endpoint requires its own token and returns actual formatted inventory",async()=>{
 const {db,sqlite}=database();try{
  const token="bot".padEnd(40,"x");
  setTestDatabase(db);Object.assign(env,{BOT_API_TOKEN:token,WOO_MAYA_KEY:"ck_test",WOO_MAYA_SECRET:"cs_test"});
  sqlite.prepare("INSERT INTO connections (id,credentials,snapshot,last_sync) VALUES (?,?,?,?)").run("maya","environment","snap",new Date().toISOString());
  const record=toRecord("maya",{id:1,name:"Tsunu",manage_stock:true,stock_quantity:14,attributes:[{name:"Weight",option:"250gr"}]},new Date().toISOString());
  sqlite.prepare("INSERT INTO records (snapshot,store_id,product_id,payload) VALUES (?,?,?,?)").run("snap","maya",1,JSON.stringify(record));
  const req=(auth?:string,message:unknown="Tsunu")=>new Request("http://local/api/bot/query",{method:"POST",headers:auth?{Authorization:"Bearer "+auth}:{},body:JSON.stringify({message})});
  assert.equal((await botQuery(req())).status,401);assert.equal((await botQuery(req("wrong"))).status,401);
  const response=await botQuery(req(token));assert.equal(response.status,200);
  const body=await response.json() as any;assert.equal(body.readOnly,true);assert.match(body.messages[0],/\*3,5 kg\*/);assert.ok(body.stores.some((s:any)=>s.id==="maya"));assert.ok(!JSON.stringify(body).includes("ck_test"));
  assert.equal((await botQuery(req(token,"x".repeat(501)))).status,400);
  assert.equal((await processRoute(new Request("http://local",{method:"POST"}))).status,401);
 }finally{sqlite.close();for(const k of Object.keys(env))delete env[k];}
});
test("processing sends each confirmed part once and resumes after a failed part",async()=>{
 const {db,sqlite}=database();try{
  await enqueueWhatsApp(db,payload(),config);let calls=0;
  const send:typeof sendWhatsAppText=async(_config,_to,text)=>{calls++;if(calls===2)throw new WhatsAppSendError("temporary",true);return "sent-"+calls;};
  const longAnswer=async()=>({text:("Texto de estoque e granel.\n").repeat(200)});
  assert.equal((await processWhatsApp(db,config,longAnswer,send)).status,"pending");
  assert.equal((await processWhatsApp(db,config,longAnswer,send)).status,"pending");
  assert.equal(sqlite.prepare("SELECT next_part FROM whatsapp_messages").get()!.next_part,1);
  sqlite.exec("UPDATE whatsapp_messages SET available_at=0");
  assert.equal((await processWhatsApp(db,config,longAnswer,send)).status,"sent");
  assert.equal(calls,3);
  assert.equal((await processWhatsApp(db,config,longAnswer,send)).processed,false);
 }finally{sqlite.close();}
});
test("concurrent workers and repeated webhooks do not send a second copy",async()=>{
 const {db,sqlite}=database();try{
  assert.equal(await enqueueWhatsApp(db,payload(),config),1);assert.equal(await enqueueWhatsApp(db,payload(),config),0);
  let sends=0;const send:typeof sendWhatsAppText=async()=>{sends++;return "id";};
  await Promise.all([processWhatsApp(db,config,answer,send),processWhatsApp(db,config,answer,send)]);
  assert.equal(sends,1);
 }finally{sqlite.close();}
});
test("disabled sending, removed permissions and expired replies do not contact Meta",async()=>{
 const {db,sqlite}=database();try{
  await enqueueWhatsApp(db,payload(),config);let sends=0;
  const send:typeof sendWhatsAppText=async()=>{sends++;return "id";};
  assert.equal((await processWhatsApp(db,{...config,sendEnabled:false},answer,send)).processed,false);
  assert.equal((await processWhatsApp(db,{...config,allowedNumbers:new Set()},answer,send)).status,"expired");
  await enqueueWhatsApp(db,payload("next"),config);
  sqlite.exec("UPDATE whatsapp_messages SET received_at=1");
  assert.equal((await processWhatsApp(db,config,answer,send)).status,"expired");
  assert.equal(sends,0);
 }finally{sqlite.close();}
});
test("permanent errors stop retries and broad queries request a narrower product",async()=>{
 const {db,sqlite}=database();try{
  await enqueueWhatsApp(db,payload(),config);
  const failing:typeof sendWhatsAppText=async()=>{throw new WhatsAppSendError("HTTP 401",false);};
  assert.equal((await processWhatsApp(db,config,answer,failing)).status,"failed");
  await enqueueWhatsApp(db,payload("next"),config);
  let sent="";const send:typeof sendWhatsAppText=async(_c,_n,t)=>{sent=t;return "id";};
  await processWhatsApp(db,config,async()=>({text:"long ".repeat(10000)}),send);
  assert.match(sent,/mais específico/);
 }finally{sqlite.close();}
});
test("Meta transport uses the fixed HTTPS origin, redacts errors and refuses redirects",async()=>{
 let calls=0;
 const request:typeof fetch=async(input,init)=>{calls++;assert.equal(String(input),"https://graph.facebook.com/v25.0/123456789/messages");assert.equal(init?.redirect,"manual");assert.equal(JSON.parse(String(init?.body)).text.preview_url,false);return Response.json({messages:[{id:"wamid.result"}]});};
 assert.equal(await sendWhatsAppText(config,"5511999999999","stock",request),"wamid.result");
 assert.equal(calls,1);
 await assert.rejects(()=>sendWhatsAppText(config,"5511888888888","stock",request));
 await assert.rejects(()=>sendWhatsAppText(config,"5511999999999","stock",(async()=>Response.json({error:{code:190,message:"test-access-token"}},{status:401})) as typeof fetch),e=>{assert.match((e as Error).message,/HTTP 401/);assert.ok(!(e as Error).message.includes("test-access-token"));return true;});
 await assert.rejects(()=>sendWhatsAppText(config,"5511999999999","stock",(async()=>new Response(null,{status:302,headers:{Location:"https://other.example"}})) as typeof fetch));
});
test("a later question from the same phone waits while an earlier reply retries",async()=>{
 const {db,sqlite}=database();try{
  await enqueueWhatsApp(db,payload("first"),config);
  await enqueueWhatsApp(db,payload("second"),config);
  sqlite.prepare("UPDATE whatsapp_messages SET available_at=? WHERE id LIKE '%first'").run(Date.now()+60000);
  let sends=0;await processWhatsApp(db,config,answer,async()=>{sends++;return "id";});
  assert.equal(sends,0);
 }finally{sqlite.close();}
});

test("WhatsApp responses preserve Pagnier kg/g quantities and warehouse names",async()=>{
 const {formatStockMessage}=await import("../lib/stock-message");
 const records=[{key:"pg1",sku:"RAYA06",name:"Tsunu",category:"Rapé",stocks:[{storeId:"pagnier" as const,id:1,quantity:3.5,quantityUnit:"kg",grams:1000,packaging:"bulk" as const,location:"Empresa · Setor A",status:"instock",updatedAt:"now"}]},
 {key:"pg2",sku:"RAYA06",name:"Tsunu",category:"Rapé",stocks:[{storeId:"pagnier" as const,id:2,quantity:500,quantityUnit:"g",grams:1,packaging:"bulk" as const,location:"Empresa · Setor B",status:"instock",updatedAt:"now"}]}];
 const text=whatsappMessages(formatStockMessage(records,["pagnier"])).join("\n");
 assert.match(text,/\*3,5 kg\*/);assert.match(text,/\*500 g\*/);assert.match(text,/Setor A/);assert.match(text,/Setor B/);assert.match(text,/Pagnier: 4 kg/);
 assert.doesNotMatch(text,/500 un\.|3,5 un\./);
});
