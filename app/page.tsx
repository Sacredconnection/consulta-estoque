"use client";
import { useEffect, useState, useRef } from "react";
import { ArrowUp, ArrowUpRight, Check, CircleHelp, LoaderCircle, Network, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { STORES, DEFAULT_RULE, type Rule, type StoreId } from "@/lib/inventory";

type Connection={id:StoreId;connected:boolean;needsSync?:boolean;catalogReady?:boolean;lastSync?:string;error?:string;sync?:{runId:string;status:string;productsDone:number;totalProducts:number;records:number;updatedAt:string;locked:boolean}|null};
type Message={role:"user"|"assistant";text:string};
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
export default function Home(){
 const [rule,setRule]=useState<Rule>(DEFAULT_RULE),[connections,setConnections]=useState<Connection[]>([]);
 const [busy,setBusy]=useState(false),[notice,setNotice]=useState(""),[ready,setReady]=useState(false);
 const [message,setMessage]=useState(""),[messages,setMessages]=useState<Message[]>([]),[chatBusy,setChatBusy]=useState(false);
 const syncRunning=useRef(false),syncAbort=useRef<AbortController|null>(null),bottom=useRef<HTMLDivElement>(null),input=useRef<HTMLTextAreaElement>(null);
 async function load(){
  try{const r=await fetch("/api/inventory",{cache:"no-store"});if(!r.ok)throw Error("Não foi possível carregar as lojas. Tente atualizar novamente.");
   const d=await r.json() as {connections:Connection[];rule:Rule};setConnections(d.connections);setRule(d.rule);
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
   const d=await r.json() as {error?:string;text:string};if(!r.ok)throw Error(d.error||"Consulta indisponível");
   setMessages(m=>[...m,{role:"assistant",text:d.text}]);
  }catch(e){setMessages(m=>[...m,{role:"assistant",text:"Não foi possível consultar: "+(e as Error).message}]);}
  finally{setChatBusy(false);input.current?.focus();}
 }
 return <div className="chat-app">
  <header className="app-header"><a href="/" className="brand" aria-label="Elo, início"><Network size={25}/><span>elo<span className="period">.</span></span></a><div className="header-title">Agente de estoque<span>WHOLESALE</span></div>
   <Button variant="outline" className="refresh" disabled={busy||!ready||!connections.length} onClick={()=>void sync()}><RefreshCw size={16} className={busy?"spin":""}/>{busy?"Atualizando…":connections.some(c=>c.sync?.status==="running")?"Retomar atualização":"Atualizar estoques"}</Button>
  </header>
  <main className="chat-main">
   <section className="store-strip" aria-label="Status das lojas">
    {!ready?<span>Carregando lojas…</span>:!connections.length?<span>Nenhuma loja configurada no ambiente local.</span>:connections.map(c=>{const s=STORES.find(s=>s.id===c.id)!;return <div key={c.id} className="store-status"><span className="store-dot" style={{background:s.color}}/><strong>{s.name}</strong><span>{c.sync?.status==="running"?"Atualizando":c.error?"Falha na atualização":!c.catalogReady||!c.lastSync?"Aguardando catálogo":<><Check size={13}/>Sincronizada</>}</span>{s.id==="maya"&&<small>EN</small>}</div>;})}
   </section>
   {connections.some(c=>c.sync?.status==="running")&&<section className="sync-progress" aria-label="Progresso da atualização">{connections.filter(c=>c.sync?.status==="running").map(c=><div key={c.id}><span>{STORES.find(s=>s.id===c.id)!.name}<small>{c.sync!.productsDone} / {c.sync!.totalProducts||"…"} produtos</small></span><Progress aria-label={"Atualização de "+STORES.find(s=>s.id===c.id)!.name} value={c.sync!.totalProducts?Math.round(c.sync!.productsDone/c.sync!.totalProducts*100):0}/></div>)}</section>}
   {notice&&<div className="notice" role="status"><CircleHelp size={17}/><span>{notice}</span><button onClick={()=>setNotice("")} aria-label="Fechar aviso"><X size={17}/></button></div>}
   {connections.filter(c=>c.error).map(c=><p className="connection-error" key={c.id} role="alert"><strong>{STORES.find(s=>s.id===c.id)!.name}:</strong> {c.error}</p>)}
   {!messages.length?<section className="welcome"><div className="eyebrow">SEU ESTOQUE, EM UMA CONVERSA</div><h1>Qual produto<br/>vamos consultar?</h1><p>Confira a disponibilidade em cada loja.<br/>Latas separadas do granel, com os totais em kg.</p><div className="suggestions">{["Veja o estoque de Tsunu","Quanto tem de Blue Lotus na Maya?","Quais produtos estão com estoque baixo?"].map((text,i)=><button key={text} disabled={chatBusy||!connections.length} onClick={()=>void ask(text)}><span className="example-number">0{i+1}</span><span>{text}</span><ArrowUpRight size={18}/></button>)}</div></section>:<section className="conversation" aria-label="Conversa com o agente" aria-live="polite" aria-relevant="additions">{messages.map((m,i)=><article key={i} className={"message "+m.role}><div className="speaker">{m.role==="user"?"Você":<><Network size={17}/>Elo · Agente de estoque</>}</div>{m.role==="user"?<p>{m.text}</p>:<Answer text={m.text}/>}</article>)}{chatBusy&&<div className="thinking" role="status"><LoaderCircle size={17} className="spin"/>Consultando o último estoque sincronizado…</div>}</section>}
   <div ref={bottom}/>
  </main>
  <div className="composer-dock"><form className="composer" onSubmit={e=>{e.preventDefault();void ask();}}><label htmlFor="question" className="sr-only">Pergunte pelo nome do produto ou SKU</label><textarea ref={input} id="question" maxLength={500} rows={2} value={message} onChange={e=>setMessage(e.target.value)} placeholder="Pergunte pelo nome do produto ou SKU…" onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();void ask();}}}/><Button type="submit" aria-label="Enviar pergunta" disabled={chatBusy||!message.trim()||!ready||!connections.length}><ArrowUp size={21}/></Button></form><p>Consulta somente leitura · Os resultados usam a última sincronização das lojas.</p></div>
 </div>;
}
