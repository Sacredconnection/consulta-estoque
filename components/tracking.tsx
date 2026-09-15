"use client";
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {RefreshCw,Mail,Upload,History} from 'lucide-react';
import {TrackingHistory} from '@/components/tracking-history';
import type {TrackedShipment} from '@/lib/tracking-service';

type Data={rows:(TrackedShipment&{skipTracking?:boolean})[];enabled:boolean;interval:number;importedAt:string|null;source:string;integration?:{provider:string;configured:boolean};carriers:{name:string;ready:boolean}[]};
const time=(s:string|null)=>s?new Date(s).toLocaleString('pt-BR'):'Nunca';
const delivery=(s:string|null)=>s?/^\d{4}-\d{2}-\d{2}$/.test(s)?s.split('-').reverse().join('/'):new Date(s).toLocaleString('pt-BR'):'Não informada';
export function Tracking(){
 const [data,setData]=useState<Data|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[query,setQuery]=useState(''),[historical,setHistorical]=useState(false),[page,setPage]=useState(1);
 const [selectedHistory,setSelectedHistory]=useState<{id:string;order:string}|null>(null);
 const uploading=useRef<HTMLInputElement>(null);
 const load=useCallback(async()=>{
  try{const r=await fetch('/api/tracking',{cache:'no-store'}),d=await r.json();if(!r.ok)throw Error(d.error||'Falha ao carregar rastreios.');setData(d);}
  catch(e){setError(e instanceof Error?e.message:'Falha ao carregar rastreios.');}
 },[]);
 useEffect(()=>{void load();const timer=setInterval(()=>void load(),30000);return()=>clearInterval(timer);},[load]);
 async function change(body:FormData|object){
  if(busy)return;setBusy(true);setError('');
  try{const form=body instanceof FormData;const r=await fetch('/api/tracking',{method:'POST',headers:form?undefined:{'Content-Type':'application/json'},body:form?body:JSON.stringify(body)}),d=await r.json();if(!r.ok)throw Error(d.error||'Falha ao atualizar rastreios.');setData(d);}
  catch(e){setError(e instanceof Error?e.message:'Falha ao atualizar rastreios.');}finally{setBusy(false);}
 }
 const rows=useMemo(()=>(data?.rows??[]).filter(r=>(historical||(!r.historical&&!r.skipTracking))&&[r.order,r.customer,r.tracking,r.carrier,r.result?.status].join(' ').toLowerCase().includes(query.toLowerCase())),[data,historical,query]);
 const current=Math.min(page,Math.max(1,Math.ceil(rows.length/50))),visible=rows.slice((current-1)*50,current*50);
 const active=data?.rows.filter(r=>!r.historical&&!r.skipTracking)??[];
 return <section className="tracking-view" aria-labelledby="tracking-title">
  <header className="tracking-heading"><div><div className="eyebrow">OPERAÇÃO LOGÍSTICA</div><h1 id="tracking-title">Rastreio de pedidos</h1><p>Cadastros da planilha, entrega e status consultados nas transportadoras.</p></div><button className="tracking-refresh" disabled={busy||!data?.carriers.some(c=>c.ready)} onClick={()=>void change({action:'refresh'})}><RefreshCw size={16} className={busy?'spin':''}/>Atualizar agora</button></header>
  {error&&<p role="alert" className="notice">{error}</p>}
  {data?.integration?.provider==='17TRACK'&&<p className="tracking-note" role="status"><strong>17TRACK · chave configurada.</strong> As consultas usam os dados mais recentes disponíveis na 17TRACK. Códigos novos podem levar alguns minutos para retornar informações. Cada novo cadastro utiliza o saldo da conta.</p>}
  <div className="tracking-controlbar"><div className="tracking-source"><span><strong>{data?.source||'Importe a planilha de envios'}</strong><small>Importação: {time(data?.importedAt??null)} · arquivo enviado</small></span><button className="tracking-refresh" disabled={busy} onClick={()=>uploading.current?.click()}><Upload size={16}/>Importar .xlsx</button><input ref={uploading} type="file" accept=".xlsx" hidden onChange={e=>{const file=e.target.files?.[0];if(file){const form=new FormData();form.append('file',file);void change(form);}e.target.value='';}}/></div>
   <div className="tracking-schedule"><label htmlFor="tracking-interval">Consultar a cada</label><select id="tracking-interval" value={data?.interval??15} disabled={busy||!data} onChange={e=>void change({action:'settings',enabled:data!.enabled,interval:Number(e.target.value)})}>{[5,15,30,60].map(n=><option key={n} value={n}>{n} min</option>)}</select><button className="tracking-toggle" disabled={busy||!data} aria-pressed={data?.enabled??false} onClick={()=>void change({action:'settings',enabled:!data!.enabled,interval:data!.interval})}>{data?.enabled?'Pausar automação':'Ativar automação'}</button></div>
  </div>
  <p className="tracking-note">O agendamento consulta os envios recentes em lotes, mesmo com o site fechado. Atualize o arquivo para incluir novos pedidos; a leitura contínua do OneDrive ainda não está conectada.</p>
  {!!data?.carriers.some(c=>!c.ready)&&<p role="status" className="notice">Integrações pendentes: {data.carriers.filter(c=>!c.ready).map(c=>c.name).join(', ')}. Os resultados serão exibidos após configurar o acesso às transportadoras.</p>}
  <div className="tracking-metrics">{[['Envios recentes',active.length],['Em trânsito',active.filter(r=>r.result?.status==='Em trânsito').length],['Entregues confirmados',active.filter(r=>r.result?.status==='Entregue').length],['Pendências',active.filter(r=>r.issue||r.error||!r.result).length]].map(([label,value])=><div key={label}><span>{label}</span><strong>{data?value:'—'}</strong></div>)}</div>
  <div className="tracking-toolbar"><label className="tracking-search"><input aria-label="Buscar pedido, cliente ou tracking" placeholder="Buscar pedido, cliente ou tracking" value={query} onChange={e=>{setQuery(e.target.value);setPage(1);}}/></label><label><input type="checkbox" checked={historical} onChange={e=>{setHistorical(e.target.checked);setPage(1);}}/> Incluir histórico, entregues e cancelados</label><button className="tracking-email" disabled><Mail size={16}/>E-mails · em breve</button></div>
  <div className="tracking-table-wrap"><table className="tracking-table"><thead><tr>{['Pedido / origem','Cliente','Transportadora / tracking','Status anotado na planilha','Entrega prevista','Rastreio na transportadora','Última consulta válida',''].map((label,i)=><th key={i}>{label}</th>)}</tr></thead><tbody>{visible.map(r=><tr key={r.id}><td>{r.order}<br/><small>{r.sheet} · linha {r.row}</small></td><td>{r.customer}</td><td>{r.carrier}<br/><code>{r.tracking||'Sem tracking'}</code></td><td>{r.orderStatus||'Não informado'}</td><td>{delivery(r.result?.expectedDelivery??null)}{r.result?.expectedDeliverySource&&<><br/><small>{r.result.expectedDeliverySource==='Official'?'Previsão da transportadora':'Estimativa '+r.result.expectedDeliverySource}</small></>}</td><td><strong>{r.result?.status??(r.skipTracking?'Entregue na planilha · consulta dispensada':'Não consultado')}</strong><br/>{r.result?.description}{r.result?.location&&<><br/>{r.result.location}</>}<br/><small>{(r.skipTracking?'Consulta dispensada: entregue na planilha.':r.issue||r.error)||(!data?.carriers.find(c=>c.name===r.carrier)?.ready?' Integração pendente':'')}</small></td><td>{time(r.result?.checkedAt??null)}{r.result?.source&&<><br/><small>Via {r.result.source}</small></>}{r.result?.eventAt&&<><br/><small>Evento: {time(r.result.eventAt)}</small></>}{r.result?.carrierSyncedAt&&<><br/><small>Coleta na transportadora: {time(r.result.carrierSyncedAt)}</small></>}</td><td><button className="tracking-refresh" disabled={busy||!!r.skipTracking||!!r.issue||!data?.carriers.find(c=>c.name===r.carrier)?.ready} onClick={()=>void change({action:'refresh',id:r.id})} aria-label={'Consultar pedido '+r.order}><RefreshCw size={14}/></button><button className="tracking-refresh" onClick={()=>setSelectedHistory({id:r.id,order:r.order})} aria-label={'Ver histórico do pedido '+r.order}><History size={14}/></button></td></tr>)}</tbody></table>{!visible.length&&<p className="tracking-empty">{data?'Nenhum envio nesta seleção.':'Carregando envios…'}</p>}</div>
  <nav className="catalog-pages" aria-label="Paginação de envios"><button disabled={current<=1} onClick={()=>setPage(current-1)}>Anterior</button><span>{rows.length} envios · página {current} de {Math.max(1,Math.ceil(rows.length/50))}</span><button disabled={current*50>=rows.length} onClick={()=>setPage(current+1)}>Próxima</button></nav>
  {selectedHistory&&<TrackingHistory key={selectedHistory.id} id={selectedHistory.id} order={selectedHistory.order} onClose={()=>setSelectedHistory(null)}/>}
 </section>;
}
