"use client";
import { useEffect, useMemo, useState, useRef } from "react";
import { ArrowLeft, ArrowRight, ArrowUp, ArrowUpRight, Check, CircleHelp, LoaderCircle, Network, RefreshCw, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { STORES, DEFAULT_RULE, type Product, type Rule, type StoreId } from "@/lib/inventory";

type Connection={id:StoreId;connected:boolean;needsSync?:boolean;catalogReady?:boolean;lastSync?:string;error?:string;sync?:{runId:string;status:string;productsDone:number;totalProducts:number;records:number;updatedAt:string;locked:boolean}|null};
type Message={role:"user"|"assistant";text:string;products?:Product[]};
function emphasis(text:string){return text.split(/(\*\*[^*]+\*\*)/g).map((part,i)=>part.startsWith("**")?<strong key={i}>{part.slice(2,-2)}</strong>:part);}
function Answer({text}:{text:string}){
 const nodes:React.ReactNode[]=[];const lines=text.split("\n");
 for(let i=0;i<lines.length;i++){
  const line=lines[i];if(!line.trim())continue;
  if(line.startsWith("### "))nodes.push(<h3 key={i}>{line.slice(4)}</h3>);
  else if(line.startsWith("## "))nodes.push(<h2 key={i}>{line.slice(3)}</h2>);
  else if(line.startsWith("- ")){
   const items:string[]=[line.slice(2)],key=i;while(lines[i+1]?.startsWith("- "))items.push(lines[++i].slice(2));
   nodes.push(<ul key={key}>{items.map((v,j)=><li key={j}>{emphasis(v)}</li>)}</ul>);
  }else nodes.push(<p key={i}>{emphasis(line)}</p>);
 }
 return <div className="answer">{nodes}</div>;
}
type StockCell={quantity:number|null;partial:boolean;shared:boolean;positions:number};
type StockRow={key:string;sku:string;product:string;presentation:string;category:string;search:string;stores:Partial<Record<StoreId,StockCell>>};
const number=(value:number)=>value.toLocaleString("pt-BR",{maximumFractionDigits:6});
const normalized=(value:string)=>value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
function buildStockRows(products:Product[]):StockRow[]{
 const grouped=new Map<string,{sku:string;names:Set<string>;presentations:Set<string>;categories:Set<string>;stores:Map<StoreId,Product["stocks"]>}>();
 for(const product of products){
  const sku=product.sku.trim(),key=sku?"sku:"+sku.toLocaleUpperCase():"key:"+product.key;
  let row=grouped.get(key);
  if(!row){row={sku:sku||"Sem SKU",names:new Set(),presentations:new Set(),categories:new Set(),stores:new Map()};grouped.set(key,row);}
  if(product.category)row.categories.add(product.category);
  for(const stock of product.stocks){
   row.names.add(stock.productName??product.name);
   row.presentations.add(stock.variationName||(stock.grams!=null?number(stock.grams)+" g":"Unidade"));
   const list=row.stores.get(stock.storeId)??[];list.push(stock);row.stores.set(stock.storeId,list);
  }
 }
 return [...grouped].map(([key,row])=>{
  const stores:Partial<Record<StoreId,StockCell>>={};
  for(const [storeId,stocks] of row.stores){
   const unique=stocks.filter((stock,index,all)=>{
    if(!stock.shared&&stock.packaging!=="shared")return true;
    const pool=stock.parentId??stock.id;
    return all.findIndex(other=>(other.shared||other.packaging==="shared")&&(other.parentId??other.id)===pool)===index;
   });
   const known=unique.filter(stock=>stock.quantity!==null);
   stores[storeId]={quantity:known.length?known.reduce((sum,stock)=>sum+stock.quantity!,0):null,partial:known.length>0&&known.length<unique.length,shared:unique.some(stock=>stock.shared||stock.packaging==="shared"),positions:unique.length};
  }
  const product=[...row.names].join(" / "),presentation=[...row.presentations].join(" / "),category=[...row.categories].join(" / ");
  return {key,sku:row.sku,product,presentation,category,stores,search:normalized([row.sku,product,presentation,category].join(" "))};
 }).sort((a,b)=>a.sku.localeCompare(b.sku,"pt-BR",{numeric:true})||a.product.localeCompare(b.product,"pt-BR"));
}
function StockTable({rows,storeIds,rule,title}:{rows:StockRow[];storeIds:StoreId[];rule:Rule;title?:string}){
 if(!rows.length)return null;
 return <section className="stock-table-section">
  {title&&<h2>{title}</h2>}
  <div className="stock-table-scroll">
   <table className="stock-table" style={{minWidth:Math.max(720,520+storeIds.length*135)}}>
    <caption className="sr-only">Uma linha por SKU, com o estoque em cada loja</caption>
    <thead><tr><th>SKU</th><th>Produto</th><th>Apresentação</th><th>Categoria</th>{storeIds.map(id=>{const store=STORES.find(item=>item.id===id)!;return <th key={id} className="numeric store-column"><span className="store-heading"><i style={{background:store.color}}/>{store.short}</span></th>;})}</tr></thead>
    <tbody>{rows.map(row=><tr key={row.key}><td className="sku-cell">{row.sku}</td><td>{row.product}</td><td>{row.presentation}</td><td>{row.category||"—"}</td>{storeIds.map(id=>{const cell=row.stores[id];const value=!cell?"—":cell.quantity===null?"N/D":number(cell.quantity)+" un.";const details=cell?[cell.positions>1?cell.positions+" posições consolidadas":"",cell.partial?"total parcial":"",cell.shared?"saldo compartilhado":""].filter(Boolean).join(" · "):"";const level=!cell||cell.quantity===null?"unknown":cell.quantity<=0?"out":cell.quantity<=rule.minimum?"low":"ok";return <td key={id} className={"numeric stock-cell "+level} title={details||undefined}>{value}{cell?.partial?" *":""}{cell?.shared?<small>comp.</small>:null}</td>;})}</tr>)}</tbody>
   </table>
  </div>
 </section>;
}
const CATALOG_PAGE_SIZE=100;
export default function Home(){
 const [rule,setRule]=useState<Rule>(DEFAULT_RULE),[connections,setConnections]=useState<Connection[]>([]);
 const [busy,setBusy]=useState(false),[notice,setNotice]=useState(""),[ready,setReady]=useState(false);
 const [message,setMessage]=useState(""),[messages,setMessages]=useState<Message[]>([]),[chatBusy,setChatBusy]=useState(false);
 const [activeView,setActiveView]=useState<"assistant"|"catalog">("assistant"),[catalogProducts,setCatalogProducts]=useState<Product[]>([]);
 const [catalogQuery,setCatalogQuery]=useState(""),[catalogPage,setCatalogPage]=useState(1);
 const syncRunning=useRef(false),syncAbort=useRef<AbortController|null>(null),bottom=useRef<HTMLDivElement>(null),input=useRef<HTMLTextAreaElement>(null);
 async function load(){
  try{const r=await fetch("/api/inventory",{cache:"no-store"});if(!r.ok)throw Error("Não foi possível carregar as lojas. Tente atualizar novamente.");
   const d=await r.json() as {connections:Connection[];rule:Rule;products:Product[]};setConnections(d.connections);setRule(d.rule);setCatalogProducts(d.products);
  }catch(e){setNotice((e as Error).message);}finally{setReady(true);}
 }
 useEffect(()=>{void load();return()=>syncAbort.current?.abort();},[]);
 useEffect(()=>{if(ready&&connections.some(c=>c.sync?.status==="running"||((c.needsSync||!c.lastSync)&&!c.error)))void sync();},[ready]);
 useEffect(()=>{if(!ready||!rule.enabled||!connections.length)return;const timer=setInterval(()=>void sync(true),rule.interval*60000);return()=>clearInterval(timer);},[ready,rule.enabled,rule.interval,connections.length]);
 useEffect(()=>{if(messages.length)bottom.current?.scrollIntoView({block:"end"});},[messages,chatBusy]);
   useEffect(()=>{
    const context=(document as Document & {modelContext?:{registerTool:(tool:unknown,options:unknown)=>Promise<void>}}).modelContext;
    if(!context)return;const lifecycle=new AbortController();
    Promise.resolve(context.registerTool({name:"consultar_estoque",description:"Consulta o último estoque registrado por produto ou SKU nas lojas configuradas. Retorna a origem e a data dos dados.",inputSchema:{type:"object",properties:{produto:{type:"string",minLength:1,maxLength:200}},required:["produto"],additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute:async(input:unknown)=>{const p=(input as {produto?:unknown})?.produto;if(typeof p!=="string"||!p.trim()||p.length>200)throw Error("Informe um nome ou SKU válido.");const r=await fetch("/api/agent",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({message:p})});if(!r.ok)throw Error("Consulta indisponível");return r.json();}},{signal:lifecycle.signal})).catch(()=>{});
    return()=>lifecycle.abort();
  },[]);

 const storeIds=connections.map(connection=>connection.id);
 const catalogRows=useMemo(()=>buildStockRows(catalogProducts),[catalogProducts]);
 const filteredCatalogRows=useMemo(()=>{
  const terms=normalized(catalogQuery).trim().split(/\s+/).filter(Boolean);
  return terms.length?catalogRows.filter(row=>terms.every(term=>row.search.includes(term))):catalogRows;
 },[catalogRows,catalogQuery]);
 const catalogPages=Math.max(1,Math.ceil(filteredCatalogRows.length/CATALOG_PAGE_SIZE));
 const currentCatalogPage=Math.min(catalogPage,catalogPages),catalogStart=(currentCatalogPage-1)*CATALOG_PAGE_SIZE;
 const visibleCatalogRows=filteredCatalogRows.slice(catalogStart,catalogStart+CATALOG_PAGE_SIZE);
 useEffect(()=>setCatalogPage(1),[catalogQuery]);

   async function sync(automatic=false){
    if(syncRunning.current)return;
    if(!connections.length){if(!automatic)setNotice("Configure uma loja no .env.local antes de atualizar.");return;}
    syncRunning.current=true;setBusy(true);
    const controller=new AbortController();syncAbort.current=controller;
    async function call(input:unknown){
      const r=await fetch("/api/sync",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(input),signal:AbortSignal.any([controller.signal,AbortSignal.timeout(60000)])});
      const d=await r.json() as {connections:Connection[];error?:string;message?:string;busy?:boolean};
      if(!r.ok)throw Error(d.error||"Não foi possível consultar esta etapa.");return d;
    }
    try{
      const initial=await call({action:"start"});let current=initial.connections;
      setConnections(current);if(!automatic)setNotice(initial.message||"Atualização iniciada.");
      let completed=current.filter(c=>c.sync?.status==="succeeded").length;
      while(!controller.signal.aborted&&current.some(c=>c.sync?.status==="running")){
        const active=current.filter(c=>c.sync?.status==="running");
        const results=await Promise.all(active.map(c=>call({action:"step",storeId:c.id,runId:c.sync!.runId})));
        const response=await fetch("/api/sync",{cache:"no-store",signal:controller.signal});
        if(!response.ok)throw Error("Não foi possível atualizar o progresso.");
        current=(await response.json() as {connections:Connection[]}).connections;setConnections(current);
        const nowCompleted=current.filter(c=>c.sync?.status==="succeeded").length;
        if(nowCompleted>completed){await load();completed=nowCompleted;}
        if(results.some(r=>r.busy))await new Promise(resolve=>setTimeout(resolve,1000));
      }
      if(!controller.signal.aborted){
        await load();
        setNotice(current.map(c=>{const name=STORES.find(s=>s.id===c.id)!.name;return name+": "+(c.sync?.status==="succeeded"?(c.sync.records.toLocaleString("pt-BR")+" registros atualizados"):c.error||"consulta não concluída");}).join(" · "));
      }
    }catch(e){
      if(!controller.signal.aborted)setNotice("Atualização pausada: "+(e as Error).message+" Clique em atualizar para retomar do último progresso salvo.");
    }finally{syncRunning.current=false;setBusy(false);syncAbort.current=null;}
  }

 async function ask(text=message){
  if(!text.trim()||chatBusy)return;setMessage("");setMessages(m=>[...m,{role:"user",text}]);setChatBusy(true);
  try{const r=await fetch("/api/agent",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({message:text})});
   const d=await r.json() as {error?:string;text:string;products?:Product[]};if(!r.ok)throw Error(d.error||"Consulta indisponível");
   setMessages(m=>[...m,{role:"assistant",text:d.text,products:d.products}]);
  }catch(e){setMessages(m=>[...m,{role:"assistant",text:"Não foi possível consultar: "+(e as Error).message}]);}
  finally{setChatBusy(false);input.current?.focus();}
 }
 return <div className="chat-app">
  <header className="app-header"><a href="/" className="brand" aria-label="Elo, início"><Network size={25}/><span>elo<span className="period">.</span></span></a><div className="header-title">Agente de estoque<span>WHOLESALE</span></div>
   <Button variant="outline" className="refresh" disabled={busy||!ready||!connections.length} onClick={()=>void sync()}><RefreshCw size={16} className={busy?"spin":""}/>{busy?"Atualizando…":connections.some(c=>c.sync?.status==="running")?"Retomar atualização":"Atualizar estoques"}</Button>
  </header>
  <main className={"chat-main "+(activeView==="catalog"?"catalog-active":"")}>
   <section className="store-strip" aria-label="Status das lojas">
    {!ready?<span>Carregando lojas…</span>:!connections.length?<span>Nenhuma loja configurada no ambiente local.</span>:connections.map(c=>{const s=STORES.find(s=>s.id===c.id)!;return <div key={c.id} className="store-status"><span className="store-dot" style={{background:s.color}}/><strong>{s.name}</strong><span>{c.sync?.status==="running"?"Atualizando":c.error?"Falha na atualização":!c.catalogReady||!c.lastSync?"Aguardando catálogo":<><Check size={13}/>Sincronizada</>}</span>{s.id==="maya"&&<small>EN</small>}</div>;})}
   </section>
   {connections.some(c=>c.sync?.status==="running")&&<section className="sync-progress" aria-label="Progresso da atualização">{connections.filter(c=>c.sync?.status==="running").map(c=><div key={c.id}><span>{STORES.find(s=>s.id===c.id)!.name}<small>{c.sync!.productsDone} / {c.sync!.totalProducts||"…"} produtos</small></span><Progress aria-label={"Atualização de "+STORES.find(s=>s.id===c.id)!.name} value={c.sync!.totalProducts?Math.round(c.sync!.productsDone/c.sync!.totalProducts*100):0}/></div>)}</section>}
   {notice&&<div className="notice" role="status"><CircleHelp size={17}/><span>{notice}</span><button onClick={()=>setNotice("")} aria-label="Fechar aviso"><X size={17}/></button></div>}
   {connections.filter(c=>c.error).map(c=><p className="connection-error" key={c.id} role="alert"><strong>{STORES.find(s=>s.id===c.id)!.name}:</strong> {c.error}</p>)}
   <nav className="view-tabs" role="tablist" aria-label="Visualização do estoque">
    <button id="assistant-tab" role="tab" aria-selected={activeView==="assistant"} aria-controls="assistant-panel" onClick={()=>setActiveView("assistant")}><Network size={16}/>Consulta IA</button>
    <button id="catalog-tab" role="tab" aria-selected={activeView==="catalog"} aria-controls="catalog-panel" onClick={()=>setActiveView("catalog")}><Search size={16}/>Todos os dados</button>
   </nav>
   {activeView==="assistant"?<div id="assistant-panel" role="tabpanel" aria-labelledby="assistant-tab">{!messages.length?<section className="welcome"><div className="eyebrow">SEU ESTOQUE, EM UMA CONVERSA</div><h1>Qual produto<br/>vamos consultar?</h1><p>Confira a disponibilidade em cada loja.<br/>Cada SKU aparece em uma linha, com o estoque por site.</p><div className="suggestions">{["Veja o estoque de Tsunu","Quanto tem de Blue Lotus na Maya?","Quais produtos estão com estoque baixo?"].map((text,i)=><button key={text} disabled={chatBusy||!connections.length} onClick={()=>void ask(text)}><span className="example-number">0{i+1}</span><span>{text}</span><ArrowUpRight size={18}/></button>)}</div></section>:<section className="conversation" aria-label="Conversa com o agente" aria-live="polite" aria-relevant="additions">{messages.map((m,i)=><article key={i} className={"message "+m.role}><div className="speaker">{m.role==="user"?"Você":<><Network size={17}/>Elo · Agente de estoque</>}</div>{m.role==="user"?<p>{m.text}</p>:<><Answer text={m.text}/>{m.products?.length?<StockTable rows={buildStockRows(m.products)} storeIds={storeIds} rule={rule} title="Resultado em tabela"/>:null}</>}</article>)}{chatBusy&&<div className="thinking" role="status"><LoaderCircle size={17} className="spin"/>Consultando o último estoque sincronizado…</div>}</section>}</div>:<section id="catalog-panel" className="catalog-view" role="tabpanel" aria-labelledby="catalog-tab"><header className="catalog-header"><div className="eyebrow">CATÁLOGO CONSOLIDADO</div><h1>Todos os dados</h1><p>Consulte produtos, apresentações e SKUs disponíveis em todas as lojas sincronizadas.</p></header><label className="catalog-search"><Search size={18}/><span className="sr-only">Buscar no catálogo</span><input value={catalogQuery} onChange={event=>setCatalogQuery(event.target.value)} placeholder="Buscar por SKU, produto, apresentação ou categoria…"/>{catalogQuery&&<button type="button" onClick={()=>setCatalogQuery("")} aria-label="Limpar busca"><X size={17}/></button>}</label>{!ready?<div className="catalog-empty"><LoaderCircle size={18} className="spin"/>Carregando catálogo…</div>:filteredCatalogRows.length?<><div className="catalog-summary"><strong>{filteredCatalogRows.length.toLocaleString("pt-BR")} SKU(s)</strong><span>Exibindo {(catalogStart+1).toLocaleString("pt-BR")}–{Math.min(catalogStart+CATALOG_PAGE_SIZE,filteredCatalogRows.length).toLocaleString("pt-BR")}</span></div><StockTable rows={visibleCatalogRows} storeIds={storeIds} rule={rule}/>{catalogPages>1&&<nav className="catalog-pages" aria-label="Paginação do catálogo"><button type="button" disabled={currentCatalogPage===1} onClick={()=>setCatalogPage(currentCatalogPage-1)}><ArrowLeft size={16}/>Anterior</button><span>Página {currentCatalogPage.toLocaleString("pt-BR")} de {catalogPages.toLocaleString("pt-BR")}</span><button type="button" disabled={currentCatalogPage===catalogPages} onClick={()=>setCatalogPage(currentCatalogPage+1)}>Próxima<ArrowRight size={16}/></button></nav>}<p className="table-note">* Total parcial. “comp.” indica saldo compartilhado entre variações. Passe o cursor sobre a célula para ver detalhes.</p></>:<div className="catalog-empty">Nenhum SKU corresponde à consulta.</div>}</section>}
   <div ref={bottom}/>
  </main>
  {activeView==="assistant"&&<div className="composer-dock"><form className="composer" onSubmit={e=>{e.preventDefault();void ask();}}><label htmlFor="question" className="sr-only">Pergunte pelo nome do produto ou SKU</label><textarea ref={input} id="question" maxLength={500} rows={2} value={message} onChange={e=>setMessage(e.target.value)} placeholder="Pergunte pelo nome do produto ou SKU…" onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();void ask();}}}/><Button type="submit" aria-label="Enviar pergunta" disabled={chatBusy||!message.trim()||!ready||!connections.length}><ArrowUp size={21}/></Button></form><p>Consulta somente leitura · Os resultados usam a última sincronização das lojas.</p></div>}
 </div>;
}
