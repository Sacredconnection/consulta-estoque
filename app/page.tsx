"use client";
import Image from "next/image";
import { Replenishment } from "@/components/replenishment";
import { useEffect, useMemo, useState, useRef } from "react";
import { ArrowLeft, ArrowRight, ArrowUp, Check, CircleHelp, LoaderCircle, Network, RefreshCw, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StockTable } from "@/components/stock-table";
import { QueryTurn } from "@/components/query-turn";
import { buildStockRows } from "@/lib/stock-table";
import type { ConnectionSetupIssue } from "@/lib/connections-env";
import { Progress } from "@/components/ui/progress";
import { STORES, DEFAULT_RULE, scopeProductsToStores, type Product, type Rule, type StoreId } from "@/lib/inventory";

type Connection={id:StoreId;connected:boolean;needsSync?:boolean;catalogReady?:boolean;lastSync?:string;error?:string;sync?:{runId:string;status:string;productsDone:number;totalProducts:number;records:number;updatedAt:string;locked:boolean}|null};
type Message={role:"user"|"assistant";text:string;products?:Product[];storeIds?:StoreId[]};
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
const normalized=(value:string)=>value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
const CATALOG_PAGE_SIZE=100;
export default function Home(){
 const [rule,setRule]=useState<Rule>(DEFAULT_RULE),[connections,setConnections]=useState<Connection[]>([]);
 const [excludedStores,setExcludedStores]=useState<StoreId[]>([]);
 const selectedStoresRef=useRef<StoreId[]>([]);
 const [connectionSetup,setConnectionSetup]=useState<ConnectionSetupIssue[]>([]);
 const [busy,setBusy]=useState(false),[notice,setNotice]=useState(""),[ready,setReady]=useState(false);
 const [message,setMessage]=useState(""),[messages,setMessages]=useState<Message[]>([]),[chatBusy,setChatBusy]=useState(false);
 const [expandedQueries,setExpandedQueries]=useState<number[]>([]);
 const latestQueryIndex=messages.reduce((last,m,index)=>m.role==="user"?index:last,-1);
 const [activeView,setActiveView]=useState<"assistant"|"catalog"|"replenishment">("assistant"),[catalogProducts,setCatalogProducts]=useState<Product[]>([]);
 const [catalogQuery,setCatalogQuery]=useState(""),[catalogPage,setCatalogPage]=useState(1);
 const syncRunning=useRef(false),syncAbort=useRef<AbortController|null>(null),bottom=useRef<HTMLDivElement>(null),input=useRef<HTMLTextAreaElement>(null);
 const loadedVersions=useRef<Record<string,string|null|undefined>>({});
 async function load(){
  try{const r=await fetch("/api/inventory",{cache:"no-store"});if(!r.ok){const failure=await r.json().catch(()=>null) as {error?:unknown}|null;throw Error(typeof failure?.error==="string"?failure.error:r.status===401?"Entre novamente com seu usuário e senha para carregar as lojas.":"Não foi possível carregar as lojas. Tente atualizar novamente.");}
   const d=await r.json() as {connections:Connection[];rule:Rule;products:Product[];connectionSetup?:ConnectionSetupIssue[]};setConnections(d.connections);setRule(d.rule);setCatalogProducts(d.products);setConnectionSetup(d.connectionSetup??[]);
   loadedVersions.current=Object.fromEntries(d.connections.map(c=>[c.id,c.lastSync]));
   setNotice(d.connections.length?"":"Nenhuma loja foi reconhecida nas variáveis do servidor. Confira os pares WOO_SACRED_KEY/SECRET, WOO_MAYA_KEY/SECRET e WOO_SC23_KEY/SECRET no ambiente Production da Vercel e faça um novo deploy.");
  }catch(e){setNotice((e as Error).message);}finally{setReady(true);}
 }
 useEffect(()=>{void load();return()=>syncAbort.current?.abort();},[]);
 useEffect(()=>{if(ready&&connections.some(c=>c.sync?.status==="running"||(c.needsSync&&!c.error)))void sync(true);},[ready]);
 useEffect(()=>{if(!ready||!rule.enabled||!connections.length)return;void sync(true,false,true);const timer=setInterval(()=>void sync(true,false,true),60000);return()=>clearInterval(timer);},[ready,rule.enabled,rule.interval,connections.length]);
 useEffect(()=>{if(messages.length)bottom.current?.scrollIntoView({block:"end"});},[messages,chatBusy]);
   useEffect(()=>{
    const context=(document as Document & {modelContext?:{registerTool:(tool:unknown,options:unknown)=>Promise<void>}}).modelContext;
    if(!context)return;const lifecycle=new AbortController();
    Promise.resolve(context.registerTool({name:"consultar_estoque",description:"Consulta o último estoque registrado por produto ou SKU nas lojas configuradas. Retorna a origem e a data dos dados.",inputSchema:{type:"object",properties:{produto:{type:"string",minLength:1,maxLength:200}},required:["produto"],additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute:async(input:unknown)=>{const p=(input as {produto?:unknown})?.produto;if(typeof p!=="string"||!p.trim()||p.length>200)throw Error("Informe um nome ou SKU válido.");const r=await fetch("/api/agent",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({message:p,storeIds:selectedStoresRef.current})});if(!r.ok)throw Error("Consulta indisponível");return r.json();}},{signal:lifecycle.signal})).catch(()=>{});
    return()=>lifecycle.abort();
  },[]);

 const storeIds=useMemo(()=>connections.map(connection=>connection.id).filter(id=>!excludedStores.includes(id)),[connections,excludedStores]);
 selectedStoresRef.current=storeIds;
 const catalogRows=useMemo(()=>buildStockRows(scopeProductsToStores(catalogProducts,storeIds)),[catalogProducts,storeIds]);
 const filteredCatalogRows=useMemo(()=>{
  const terms=normalized(catalogQuery).trim().split(/\s+/).filter(Boolean);
  return terms.length?catalogRows.filter(row=>terms.every(term=>row.search.includes(term))):catalogRows;
 },[catalogRows,catalogQuery]);
 const catalogPages=Math.max(1,Math.ceil(filteredCatalogRows.length/CATALOG_PAGE_SIZE));
 const currentCatalogPage=Math.min(catalogPage,catalogPages),catalogStart=(currentCatalogPage-1)*CATALOG_PAGE_SIZE;
 const visibleCatalogRows=filteredCatalogRows.slice(catalogStart,catalogStart+CATALOG_PAGE_SIZE);
 useEffect(()=>setCatalogPage(1),[catalogQuery,storeIds]);

   async function sync(automatic=false,force=false,scheduled=false){
    if(syncRunning.current)return;
    if(!connections.length){if(!automatic)setNotice("Configure as credenciais de uma loja nas variáveis de ambiente do servidor antes de atualizar.");return;}
    syncRunning.current=true;setBusy(true);
    const controller=new AbortController();syncAbort.current=controller;
    async function call(input:unknown){
      const r=await fetch("/api/sync",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(input),signal:AbortSignal.any([controller.signal,AbortSignal.timeout(60000)])});
      const d=await r.json() as {connections:Connection[];error?:string;message?:string;busy?:boolean;cached?:boolean};
      if(!r.ok)throw Error(d.error||"Não foi possível consultar esta etapa.");return d;
    }
    try{
      const initial=await call({action:"start",force,scheduled});let current=initial.connections;
      setConnections(current);if(!automatic)setNotice(initial.message||"Atualização iniciada.");
      if(initial.cached){if(current.some(c=>loadedVersions.current[c.id]!==c.lastSync))await load();return;}
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
        if(!automatic)setNotice(current.map(c=>{const name=STORES.find(s=>s.id===c.id)!.name;return name+": "+(c.sync?.status==="succeeded"?(c.sync.records.toLocaleString("pt-BR")+" registros em cache"):c.error||"consulta não concluída");}).join(" · "));
      }
    }catch(e){
      if(!controller.signal.aborted)setNotice("Atualização pausada: "+(e as Error).message+" Clique em atualizar para retomar do último progresso salvo.");
    }finally{syncRunning.current=false;setBusy(false);syncAbort.current=null;}
  }

 async function ask(text=message){
  if(!text.trim()||chatBusy||!storeIds.length)return;setExpandedQueries([]);setMessage("");setMessages(m=>[...m,{role:"user",text,storeIds:[...storeIds]}]);setChatBusy(true);
  try{const r=await fetch("/api/agent",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({message:text,storeIds})});
   const d=await r.json() as {error?:string;text:string;products?:Product[]};if(!r.ok)throw Error(d.error||"Consulta indisponível");
   setMessages(m=>[...m,{role:"assistant",text:d.text,products:d.products,storeIds:[...storeIds]}]);
  }catch(e){setMessages(m=>[...m,{role:"assistant",text:"Não foi possível consultar: "+(e as Error).message}]);}
  finally{setChatBusy(false);input.current?.focus();}
 }

 const isLanding=activeView==="assistant"&&!messages.length;
 const formatSync=(value:string)=>new Date(value).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
 const latestSync=connections.map(c=>c.lastSync).filter((value):value is string=>!!value).sort((a,b)=>Date.parse(b)-Date.parse(a))[0];
 const pendingCount=connections.filter(c=>!c.catalogReady||!c.lastSync).length;
 const companyFilter=connections.length>0&&<fieldset className="company-filter" disabled={chatBusy}><legend>Empresas nas buscas</legend><div className="company-options">{connections.map(c=>{const store=STORES.find(s=>s.id===c.id)!;return <label key={c.id}><input type="checkbox" checked={storeIds.includes(c.id)} onChange={()=>setExcludedStores(current=>current.includes(c.id)?current.filter(id=>id!==c.id):[...current,c.id])}/><span className="store-dot" style={{background:store.color}}/>{store.short}</label>;})}<button type="button" onClick={()=>setExcludedStores([])} disabled={storeIds.length===connections.length}>Selecionar todas</button></div><p>{storeIds.length?`${storeIds.length} de ${connections.length} selecionadas. O filtro vale para novas consultas e para o catálogo.`:'Selecione pelo menos uma empresa para consultar.'}</p></fieldset>;
 const composer=<form className="composer" onSubmit={e=>{e.preventDefault();void ask();}}><label htmlFor="question" className="sr-only">Pergunte pelo nome do produto ou SKU</label><textarea ref={input} id="question" maxLength={500} rows={isLanding?1:2} value={message} onChange={e=>setMessage(e.target.value)} placeholder="Digite um produto ou código, como RAYA02" onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();void ask();}}}/><Button type="submit" aria-label="Enviar pergunta" disabled={chatBusy||!message.trim()||!ready||!storeIds.length}>{isLanding?<><Search size={19}/><span>Consultar</span></>:<ArrowUp size={21}/>}</Button></form>;
 const syncSummary=<details className="sync-summary"><summary>{!ready?'Carregando empresas…':!connections.length?'Nenhuma empresa configurada':<><span>{connections.length} empresas</span><span>{connections.some(c=>c.error)?'Há falhas na sincronização':connections.some(c=>c.sync?.status==='running')?'Atualização em andamento':pendingCount?pendingCount+' aguardando catálogo':latestSync?'Atualização mais recente: '+formatSync(latestSync)+' (Brasília)':'Aguardando sincronização'}</span></>}<span className="sync-details-label">Ver por empresa</span></summary><section className="store-strip" aria-label="Status das lojas">
    {!ready?<span>Carregando lojas…</span>:!connections.length?<span>Nenhuma loja configurada no ambiente local.</span>:connections.map(c=>{const s=STORES.find(s=>s.id===c.id)!;return <div key={c.id} className="store-status"><span className="store-dot" style={{background:s.color}}/><strong>{s.name}</strong><span>{c.sync?.status==="running"?"Atualizando":c.error?"Falha na atualização":!c.catalogReady||!c.lastSync?"Aguardando catálogo":<><Check size={13}/>Sincronizada</>}</span>{c.lastSync&&<time dateTime={c.lastSync}>{formatSync(c.lastSync)}</time>}{s.id==="maya"&&<small>EN</small>}</div>;})}
   </section></details>;
 return <div className="chat-app">
  <header className="app-header"><a href="/" className="brand" aria-label="MS Lumiar, início"><Image src="/ms-lumiar-logo.png" alt="MS Lumiar" width={901} height={370} priority/></a><div className="header-title">Agente de estoque<span>WHOLESALE</span></div>
   <Button variant="outline" className="refresh" disabled={busy||!ready||!connections.length} onClick={()=>void sync(false,!connections.some(c=>c.sync?.status==="running"))} title="Força nova leitura das fontes. Abrir o site e consultar produtos usa o cache persistente."><RefreshCw size={16} className={busy?"spin":""}/>{busy?"Atualizando…":connections.some(c=>c.sync?.status==="running")?"Retomar atualização":"Atualizar manualmente"}</Button>
  </header>
  <main className={"chat-main "+(isLanding?"landing-main ":"")+(activeView!=="assistant"?"catalog-active":"")}>
   {!isLanding&&syncSummary}
   {connections.some(c=>c.sync?.status==="running")&&<section className="sync-progress" aria-label="Progresso da atualização">{connections.filter(c=>c.sync?.status==="running").map(c=><div key={c.id}><span>{STORES.find(s=>s.id===c.id)!.name}<small>{c.sync!.productsDone} / {c.sync!.totalProducts||"…"} produtos</small></span><Progress aria-label={"Atualização de "+STORES.find(s=>s.id===c.id)!.name} value={c.sync!.totalProducts?Math.round(c.sync!.productsDone/c.sync!.totalProducts*100):0}/></div>)}</section>}
   {notice&&<div className="notice" role="status"><CircleHelp size={17}/><span>{notice}</span><button onClick={()=>setNotice("")} aria-label="Fechar aviso"><X size={17}/></button></div>}
   {connectionSetup.map(issue=><div className="notice" role="status" key={issue.id}><CircleHelp size={17}/><span><strong>{STORES.find(s=>s.id===issue.id)!.name} · configuração incompleta:</strong> {issue.message}</span></div>)}
   {connections.filter(c=>c.error).map(c=><p className="connection-error" key={c.id} role="alert"><strong>{STORES.find(s=>s.id===c.id)!.name}:</strong> {c.error}</p>)}
   {!isLanding&&activeView!=="replenishment"&&companyFilter}
   <nav className="view-tabs" role="tablist" aria-label="Visualização do estoque">
    <button id="assistant-tab" role="tab" aria-selected={activeView==="assistant"} aria-controls="assistant-panel" onClick={()=>setActiveView("assistant")}><Network size={16}/>Consulta IA</button>
    <button id="catalog-tab" role="tab" aria-selected={activeView==="catalog"} aria-controls="catalog-panel" onClick={()=>setActiveView("catalog")}><Search size={16}/>Todos os dados</button>
    <button id="replenishment-tab" role="tab" aria-selected={activeView==="replenishment"} aria-controls="replenishment-panel" onClick={()=>setActiveView("replenishment")}>Reposição de Estoque</button>
   </nav>
   {activeView==="assistant"?<div id="assistant-panel" role="tabpanel" aria-labelledby="assistant-tab">{!messages.length?<section className="welcome search-welcome"><div className="eyebrow">ESTOQUE CONSOLIDADO</div><h1>Consulte seu estoque</h1><p>Busque por produto ou código nas empresas selecionadas.</p><div className="search-start">{companyFilter}{composer}<p className="search-example"><span><code>RAYA02</code> família completa</span><span><code>RAYA02-10</code> apresentação específica</span></p>{syncSummary}</div></section>:<section className="conversation" aria-label="Conversa com o agente" aria-live="polite" aria-relevant="additions">{messages.map((m,i)=>{if(m.role!=="user")return null;const response=messages[i+1];return <QueryTurn key={i} question={m.text} index={i} historical={i!==latestQueryIndex} expanded={expandedQueries.includes(i)} onToggle={()=>setExpandedQueries(current=>current.includes(i)?current.filter(index=>index!==i):[...current,i])}>{response?.role==="assistant"&&<article className="message assistant"><div className="speaker"><Network size={17}/>MS Lumiar · Agente de estoque</div><p className="query-companies">Empresas: {(response.storeIds??storeIds).map(id=>STORES.find(s=>s.id===id)!.short).join(" / ")}</p>{response.products?.length?<StockTable rows={buildStockRows(response.products)} storeIds={response.storeIds??storeIds} rule={rule} title="Resultado em tabela"/>:<Answer text={response.text}/>}</article>}</QueryTurn>;})}{chatBusy&&<div className="thinking" role="status"><LoaderCircle size={17} className="spin"/>Consultando o último estoque sincronizado…</div>}</section>}</div>:activeView==="replenishment"?<div id="replenishment-panel" role="tabpanel" aria-labelledby="replenishment-tab"><Replenishment/></div>:<section id="catalog-panel" className="catalog-view" role="tabpanel" aria-labelledby="catalog-tab"><header className="catalog-header"><div className="eyebrow">CATÁLOGO CONSOLIDADO</div><h1>Todos os dados</h1><p>Consulte produtos, apresentações e SKUs disponíveis em todas as lojas sincronizadas.</p></header><label className="catalog-search"><Search size={18}/><span className="sr-only">Buscar no catálogo</span><input value={catalogQuery} onChange={event=>setCatalogQuery(event.target.value)} placeholder="Buscar por SKU, produto, apresentação ou categoria…"/>{catalogQuery&&<button type="button" onClick={()=>setCatalogQuery("")} aria-label="Limpar busca"><X size={17}/></button>}</label>{!ready?<div className="catalog-empty"><LoaderCircle size={18} className="spin"/>Carregando catálogo…</div>:filteredCatalogRows.length?<><div className="catalog-summary"><strong>{filteredCatalogRows.length.toLocaleString("pt-BR")} SKU(s)</strong><span>Exibindo {(catalogStart+1).toLocaleString("pt-BR")}–{Math.min(catalogStart+CATALOG_PAGE_SIZE,filteredCatalogRows.length).toLocaleString("pt-BR")}</span></div><StockTable totalRows={filteredCatalogRows} rows={visibleCatalogRows} storeIds={storeIds} rule={rule}/>{catalogPages>1&&<nav className="catalog-pages" aria-label="Paginação do catálogo"><button type="button" disabled={currentCatalogPage===1} onClick={()=>setCatalogPage(currentCatalogPage-1)}><ArrowLeft size={16}/>Anterior</button><span>Página {currentCatalogPage.toLocaleString("pt-BR")} de {catalogPages.toLocaleString("pt-BR")}</span><button type="button" disabled={currentCatalogPage===catalogPages} onClick={()=>setCatalogPage(currentCatalogPage+1)}>Próxima<ArrowRight size={16}/></button></nav>}<p className="table-note">* Total parcial. “comp.” indica saldo compartilhado entre variações. Passe o cursor sobre a célula para ver detalhes.</p></>:<div className="catalog-empty">Nenhum SKU corresponde à consulta.</div>}</section>}
   <div ref={bottom}/>
  </main>
  {activeView==="assistant"&&!isLanding&&<div className="composer-dock">{composer}<p>Consulta somente leitura · Os resultados usam a última sincronização das lojas.</p></div>}
 </div>;
}
