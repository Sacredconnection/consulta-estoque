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
