import test from "node:test";
import assert from "node:assert/strict";
import { DEMO_PRODUCTS,DEFAULT_RULE,agentAnswer,recommendations,stockLevel,searchProducts } from "../lib/inventory";
import { toRecord,readCatalog,wooPages,mergeCatalog,wooPage } from "../lib/woo";
test("unknown stock is never zero or a replenishment recommendation",()=>{
 const unknown=DEMO_PRODUCTS.find(p=>p.sku==="HER-MUG-50")!.stocks[0];
 assert.equal(stockLevel(unknown,DEFAULT_RULE),"unknown");
 assert.ok(!recommendations(DEMO_PRODUCTS,DEFAULT_RULE).some(r=>r.stock.quantity===null));
});
test("threshold is inclusive and replenishment never creates a negative quantity",()=>{
 const p=structuredClone(DEMO_PRODUCTS[0]);p.stocks=[{...p.stocks[0],quantity:10}];
 assert.equal(recommendations([p],DEFAULT_RULE)[0].quantity,30);
 p.stocks[0].quantity=-3;assert.equal(recommendations([p],DEFAULT_RULE)[0].quantity,40);
 p.stocks[0].quantity=41;assert.equal(recommendations([p],DEFAULT_RULE).length,0);
});
test("Portuguese queries find products across stores, exact SKU, low stock and store scope",()=>{
 assert.equal(agentAnswer(DEMO_PRODUCTS,DEFAULT_RULE,"Veja para mim o estoque de Tsunu em cada um dos sites").products[0].sku,"RAP-TSU-10");
 assert.equal(agentAnswer(DEMO_PRODUCTS,DEFAULT_RULE,"RAP-TSU-10").products.length,1);
 assert.equal(agentAnswer(DEMO_PRODUCTS,DEFAULT_RULE,"estoque de Tsunu na Maya").products[0].stocks.length,1);
 assert.ok(agentAnswer(DEMO_PRODUCTS,DEFAULT_RULE,"Quais produtos estão com estoque baixo?").products.length>0);
 assert.equal(agentAnswer(DEMO_PRODUCTS,DEFAULT_RULE,"produto inexistente XYZ").products.length,0);
 assert.equal(searchProducts(DEMO_PRODUCTS,"rape tsunu").length,1);
});
test("parent pools are counted once; variations retain shared stock and missing SKU stays local",()=>{
 const parent={id:1,name:"Herb",type:"variable",manage_stock:true as const,stock_quantity:30,sku:"HERB"};
 const p=toRecord("sacred",parent,"now");
 const v=toRecord("sacred",{id:2,manage_stock:"parent",stock_quantity:30,attributes:[{option:"10g"}]},"now",parent);
 assert.equal(p.stocks[0].quantity,30);assert.equal(v.stocks[0].shared,true);
 assert.equal(recommendations([v],{...DEFAULT_RULE,minimum:50,target:100}).length,0);
 assert.notEqual(v.key,toRecord("maya",{id:2},"now").key);
 assert.equal(toRecord("sacred",{id:3,manage_stock:false,stock_quantity:0},"now").stocks[0].quantity,null);
});
test("same SKU merges stores but missing SKU does not",()=>{
 const a=toRecord("sacred",{id:1,sku:"ABC"},"now"),b=toRecord("maya",{id:9,sku:"ABC"},"now");
 assert.equal(mergeCatalog([a,b])[0].stocks.length,2);
 assert.equal(mergeCatalog([toRecord("sacred",{id:1},"now"),toRecord("maya",{id:1},"now")]).length,2);
});
const credentials={key:"ck_test",secret:"cs_test"};
test("pagination reads beyond the first 100 products and requests fixed HTTPS origins",async()=>{
 let calls=0;
 const fake=async(input:RequestInfo|URL,init?:RequestInit)=>{const u=new URL(String(input));assert.equal(u.host,"backend-wholesale.sacred-snuff.com");assert.equal(init?.redirect,"manual");calls++;return Response.json(Array.from({length:calls===1?100:1},(_,i)=>({id:(calls-1)*100+i+1})),{headers:{"X-WP-TotalPages":"2"}});};
 const pages=[];for await(const p of wooPages("sacred",credentials,"products",fake as typeof fetch))pages.push(...p);
 assert.equal(pages.length,101);assert.equal(calls,2);
});
test("catalog includes variations and isolates duplicate SKU within a shop",async()=>{
 const fake=async(input:RequestInfo|URL)=>String(input).includes("/variations")?Response.json([{id:3,sku:"DUP",manage_stock:true,stock_quantity:8},{id:4,sku:"DUP",manage_stock:true,stock_quantity:5}]):Response.json([{id:1,name:"Variable",type:"variable",manage_stock:false}]);
 const rows=await readCatalog("maya",credentials,"now",fake as typeof fetch);
 assert.equal(rows.length,2);assert.notEqual(rows[0].key,rows[1].key);
});
test("authentication errors do not expose credentials or remote error payloads",async()=>{
 await assert.rejects(()=>wooPage("sacred",credentials,"products",{},(async()=>Response.json({message:"secret remote content"},{status:401})) as typeof fetch),e=>{assert.ok((e as Error).message.includes("recusou"));assert.ok(!(e as Error).message.includes("secret"));return true;});
});
test("malformed catalog is rejected rather than treated as empty inventory",async()=>{
 await assert.rejects(()=>wooPage("maya",credentials,"products",{},(async()=>Response.json({products:[]})) as typeof fetch));
});

import { canonicalStoreEnvironment,environmentConnections } from "../lib/connections-env";
test("legacy environment prefixes map by exact HTTPS hostname, including ampersand",()=>{
 const vars=canonicalStoreEnvironment({"H&F_SITE_URL":"https://backend-wholesale.sacred-snuff.com","H&F_CONSUMER_KEY":"ck_test","H&F_CONSUMER_SECRET":"cs_test",BRINCR_SITE_URL:"https://backend-wholesale.mayaherbs.com",BRINCR_CONSUMER_KEY:"ck_maya",BRINCR_CONSUMER_SECRET:"cs_maya"});
 assert.equal(vars.WOO_SACRED_KEY,"ck_test");assert.equal(vars.WOO_MAYA_KEY,"ck_maya");assert.ok(!vars.WOO_SC23_KEY);
 assert.equal(environmentConnections(vars).length,2);
});
test("unknown hosts and incomplete pairs never become connections",()=>{
 assert.deepEqual(canonicalStoreEnvironment({X_SITE_URL:"https://attacker.example",X_CONSUMER_KEY:"ck_test",X_CONSUMER_SECRET:"cs_test"}),{});
 assert.deepEqual(environmentConnections({WOO_SACRED_KEY:"ck_test"}),[]);
 assert.deepEqual(canonicalStoreEnvironment({X_SITE_URL:"http://backend-wholesale.sacred-snuff.com",X_CONSUMER_KEY:"ck_test",X_CONSUMER_SECRET:"cs_test"}),{});
});
test("redirects are rejected without forwarding authorization to another origin",async()=>{
 let count=0;await assert.rejects(()=>wooPage("sacred",credentials,"products",{},(async(_url,options)=>{count++;assert.equal(options?.redirect,"manual");return new Response(null,{status:302,headers:{Location:"https://other.example"}});}) as typeof fetch),/redirecionou/);assert.equal(count,1);
});

import {scopeProductsToStores} from "../lib/inventory";
test("unconfigured shops and their historical stock are removed from totals and recommendations",()=>{
 const scoped=scopeProductsToStores(DEMO_PRODUCTS,["sacred","maya"]);
 assert.ok(scoped.every(p=>p.stocks.every(s=>s.storeId!=="sc23")));
 assert.ok(recommendations(scoped,DEFAULT_RULE).every(r=>r.stock.storeId!=="sc23"));
 assert.deepEqual(scopeProductsToStores(DEMO_PRODUCTS,[]),[]);
 assert.equal(DEMO_PRODUCTS[0].stocks.length,3);
});
test("agent does not return stores missing configuration or fabricate demo data when no stores exist",()=>{
 assert.equal(agentAnswer(DEMO_PRODUCTS,DEFAULT_RULE,"estoque de Tsunu na SC23",["sacred","maya"]).products.length,0);
 assert.equal(agentAnswer(DEMO_PRODUCTS,DEFAULT_RULE,"estoque de Tsunu",[]).products.length,0);
 assert.equal(agentAnswer(DEMO_PRODUCTS,DEFAULT_RULE,"estoque de Tsunu",["sacred"]).products[0].stocks.length,1);
});
test("safe WooCommerce diagnostic preserves HTTP status and recognized cause without raw payloads",async()=>{
 await assert.rejects(()=>wooPage("maya",credentials,"products",{},(async()=>Response.json({code:"woocommerce_rest_authentication_error",message:"Consumer key is invalid"},{status:401})) as typeof fetch),e=>{
  const m=(e as Error).message;assert.match(m,/HTTP 401/);assert.match(m,/woocommerce_rest_authentication_error/);assert.match(m,/Consumer key é inválida/);return true;
 });
});

import {advanceCatalog,initialCursor} from "../lib/sync-cursor";
test("incremental catalog persists page cursor and completes only after all product pages",async()=>{
 let calls=0;let cursor=initialCursor();let all=0;
 const request=(async(input:RequestInfo|URL)=>{
  calls++;const page=Number(new URL(String(input)).searchParams.get("page"));
  return Response.json(Array.from({length:page<3?100:51},(_,i)=>({id:(page-1)*100+i+1,type:"simple",manage_stock:true,stock_quantity:5})),{headers:{"X-WP-TotalPages":"3","X-WP-Total":"251"}});
 }) as typeof fetch;
 for(let page=1;page<=3;page++){const result=await advanceCatalog("maya",credentials,cursor,request);assert.equal(result.done,page===3);all+=result.records.length;cursor=JSON.parse(JSON.stringify(result.cursor));}
 assert.equal(calls,3);assert.equal(all,251);assert.equal(cursor.productsDone,251);assert.equal(cursor.totalProducts,251);
});
test("variable products resume across short steps and only finish after every variation page",async()=>{
 let concurrent=0,maximum=0;
 const request=(async(input:RequestInfo|URL)=>{
  const u=new URL(String(input));const parentMatch=u.pathname.match(/products\/(\d+)\/variations/);
  if(!parentMatch)return Response.json(Array.from({length:8},(_,i)=>({id:i+1,type:"variable",name:"Product "+i,manage_stock:false})),{headers:{"X-WP-TotalPages":"1","X-WP-Total":"8"}});
  concurrent++;maximum=Math.max(maximum,concurrent);await new Promise(r=>setTimeout(r,1));concurrent--;
  const parent=Number(parentMatch[1]),page=Number(u.searchParams.get("page"));
  const count=parent===1&&page===1?100:2;
  return Response.json(Array.from({length:count},(_,i)=>({id:parent*1000+page*100+i,manage_stock:true,stock_quantity:4})),{headers:{"X-WP-TotalPages":parent===1?"2":"1"}});
 }) as typeof fetch;
 let cursor=initialCursor(),done=false,records=0,steps=0;
 while(!done){const before=JSON.stringify(cursor);const result=await advanceCatalog("maya",credentials,cursor,request);assert.equal(JSON.stringify(cursor),before);cursor=JSON.parse(JSON.stringify(result.cursor));records+=result.records.length;done=result.done;steps++;assert.ok(steps<10);}
 assert.ok(steps>1);assert.ok(maximum<=6);assert.equal(cursor.productsDone,8);assert.equal(records,116);
});
test("a failed step does not advance the saved cursor and can be retried",async()=>{
 const cursor=initialCursor(),before=JSON.stringify(cursor);
 await assert.rejects(()=>advanceCatalog("maya",credentials,cursor,(async()=>Response.json({code:"woocommerce_rest_authentication_error"},{status:401})) as typeof fetch),/HTTP 401/);
 assert.equal(JSON.stringify(cursor),before);
 const retry=await advanceCatalog("maya",credentials,cursor,(async()=>Response.json([{id:1,type:"simple"}])) as typeof fetch);
 assert.equal(retry.done,true);assert.equal(retry.records.length,1);
});
test("incrementally collected duplicate SKUs stay isolated within their store",()=>{
 const first=toRecord("maya",{id:1,sku:"DUP"},"now"),second=toRecord("maya",{id:2,sku:"DUP"},"now");
 const other=toRecord("sacred",{id:3,sku:"DUP"},"now");
 const merged=mergeCatalog([first,second,other]);assert.equal(merged.length,3);assert.ok(merged.every(p=>p.stocks.length===1));
});

import {netGrams,packaging} from "../lib/packaging";
import {formatStockMessage} from "../lib/stock-message";
test("net mass accepts store labels and decimal kg but rejects ambiguous packs",()=>{
 for(const [text,grams] of [["5gr",5],["10 g",10],["20 grams",20],["50gr",50],["250gr",250],["0,5 kg",500],["1.25kg",1250]] as const)assert.equal(netGrams(text),grams);
 for(const text of ["10 x 50g","kit 50g","50g / 100g","100ml","SKU250","100"])assert.equal(netGrams(text),null);
 for(const g of [5,10,20,50])assert.equal(packaging({id:1,attributes:[{name:"Weight",option:g+"gr"}]}).packaging,"can");
 assert.deepEqual(packaging({id:1,attributes:[{name:"Weight",option:"250gr"}]}),{grams:250,packaging:"bulk"});
 assert.deepEqual(packaging({id:1,name:"Herb",weight:"0.5"} as any),{grams:null,packaging:"other"});
 assert.equal(packaging({id:1,attributes:[{name:"Weight",option:"10gr"}],weight:"0.05"} as any).grams,10);
});
test("formatted response separates cans and sums each bulk variant by store without unknowns",()=>{
 const parent={id:1,name:"Tsunu",type:"variable",manage_stock:false};
 const make=(store: "maya"|"sacred",id:number,weight:string,quantity:number|null)=>toRecord(store,{id,manage_stock:true,stock_quantity:quantity,attributes:[{name:"Weight",option:weight}]},"now",parent);
 const products=[make("maya",2,"10gr",82),make("maya",3,"250gr",14),make("maya",4,"500gr",24),make("maya",5,"1kg",null),make("sacred",6,"100gr",10)];
 const text=formatStockMessage(products,["sacred","maya"]);
 assert.match(text,/Latas/);assert.match(text,/Granel \(atacado\)/);assert.match(text,/250gr: \*\*14 un\.\*\* × 0,25 kg = \*\*3,5 kg\*\*/);
 assert.match(text,/Maya Herbs: 15,5 kg \(parcial\)/);assert.match(text,/16,5 kg \(parcial\)/);assert.match(text,/quantidade não informada/);
 assert.doesNotMatch(text,/16,32|17,32/);
});
test("shared balances and unidentified weights never inflate kg totals",()=>{
 const parent={id:1,name:"Tsunu",type:"variable",manage_stock:true,stock_quantity:30};
 const records=[toRecord("maya",parent,"now"),toRecord("maya",{id:2,manage_stock:"parent",attributes:[{option:"500gr"}]},"now",parent)];
 const text=formatStockMessage(records,["maya"]);
 assert.match(text,/Estoque compartilhado/);assert.match(text,/não entram no total em kg/);assert.doesNotMatch(text,/15 kg/);
});
test("same SKU across stores retains each store's name, net mass and grouping",()=>{
 const a=toRecord("sacred",{id:1,name:"Local Tsunu",sku:"SAME",manage_stock:true,stock_quantity:3,attributes:[{option:"100gr"}]},"now");
 const b=toRecord("maya",{id:2,name:"English Tsunu",sku:"SAME",manage_stock:true,stock_quantity:4,attributes:[{option:"250gr"}]},"now");
 const text=formatStockMessage(mergeCatalog([a,b]),["sacred","maya"]);
 assert.match(text,/Local Tsunu/);assert.match(text,/English Tsunu/);assert.match(text,/Sacred Snuff: 0,3 kg/);assert.match(text,/Maya Herbs: 1 kg/);
});
test("Maya always requests English on both product and variation pagination",async()=>{
 let calls=0;
 const request=(async(input:RequestInfo|URL)=>{
  const url=new URL(String(input));assert.equal(url.searchParams.get("lang"),"en");calls++;
  return Response.json(url.pathname.endsWith("/variations")?[{id:2,lang:"en",attributes:[{option:"250gr"}]}]:[{id:1,lang:"en",translations:{en:1,fr:3},type:"variable",name:"English"}]);
 }) as typeof fetch;
 const result=await advanceCatalog("maya",credentials,initialCursor(),request);
 assert.equal(calls,2);assert.equal(result.records.length,1);assert.equal(result.records[0].stocks[0].productName,"English");
 await wooPage("maya",credentials,"products",{lang:"fr"},request);
 await wooPage("sacred",credentials,"products",{},(async(input)=>{assert.equal(new URL(String(input)).searchParams.has("lang"),false);return Response.json([]);}) as typeof fetch);
});
test("Maya fails closed if API ignores the requested language",async()=>{
 for(const item of [{id:1,lang:"fr"}]){
  await assert.rejects(()=>wooPage("maya",credentials,"products",{},(async()=>Response.json([item])) as typeof fetch),/fora do inglês/);
 }
});

test("Polylang English aliases are excluded without ending pagination early",async()=>{
 const request=(async(input:RequestInfo|URL)=>{const page=Number(new URL(String(input)).searchParams.get("page"));return Response.json(page===1?Array.from({length:100},(_,i)=>({id:i+1,lang:"en",translations:{en:i===0?2:i+1}})):[{id:101,lang:"en"}]);}) as typeof fetch;
 const records=[];for await(const page of wooPages("maya",credentials,"products",request))records.push(...page);
 assert.equal(records.length,100);assert.ok(!records.some(p=>p.id===1));assert.ok(records.some(p=>p.id===101));
 const first=await advanceCatalog("maya",credentials,initialCursor(),request);assert.equal(first.done,false);assert.equal(first.cursor.productsSeen,100);assert.equal(first.cursor.productsDone,100);
});
