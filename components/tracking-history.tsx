"use client";
import {useEffect,useState} from 'react';
import type {HistoryEntry} from '@/lib/tracking-history';

const names:Record<string,string>={baseline:'Cadastro preservado',legacy:'Mudança antiga',import:'Importação da planilha',removed:'Removido da planilha',consultation:'Consulta de rastreio'};
export function TrackingHistory({id,order,onClose}:{id:string;order:string;onClose:()=>void}){
 const [items,setItems]=useState<HistoryEntry[]>([]),[cursor,setCursor]=useState<number|null>(null),[before,setBefore]=useState<number|undefined>(),[loading,setLoading]=useState(true),[error,setError]=useState('');
 useEffect(()=>{
  const controller=new AbortController();setLoading(true);setError('');
  const params=new URLSearchParams({shipmentId:id,limit:'25'});if(before!==undefined)params.set('before',String(before));
  void fetch('/api/tracking/history?'+params,{cache:'no-store',signal:controller.signal}).then(async response=>{
   const data=await response.json();if(!response.ok)throw Error(data.error||'Não foi possível carregar o histórico.');
   if(!controller.signal.aborted){setItems(current=>before===undefined?data.items:[...current,...data.items]);setCursor(data.nextCursor);}
  }).catch(e=>{if(!controller.signal.aborted)setError(e instanceof Error?e.message:'Falha ao carregar histórico.');}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
  return()=>controller.abort();
 },[id,before]);
 return <section className="tracking-history" aria-label={'Histórico do pedido '+order}>
  <header className="tracking-heading"><div><h2>Histórico · {order}</h2><p>Consultas e cadastros preservados no banco, inclusive após reimportações.</p></div><button className="tracking-refresh" onClick={onClose}>Fechar histórico</button></header>
  {error&&<p role="alert">{error}</p>}
  <div className="tracking-table-wrap"><table className="tracking-table"><thead><tr><th>Registrado em</th><th>Tipo / origem</th><th>Status / previsão</th><th>Detalhes</th></tr></thead><tbody>{items.map(item=>{
   const result=item.kind==='consultation'?item.data.response:item.data.shipment?.result;
   return <tr key={item.id}><td>{new Date(item.at).toLocaleString('pt-BR')}</td><td>{names[item.kind]??item.kind}<br/>{item.data.provider??result?.source??'Cadastro'}{item.changed&&<small> · mudança de status</small>}</td><td>{item.data.error?'Consulta sem resultado novo':item.status??'Não consultado'}{result?.expectedDelivery&&<><br/>Previsão: {result.expectedDelivery}</>}</td><td>{item.data.legacyStatus??item.data.error??result?.description??item.data.shipment?.orderStatus??'Sem detalhes'}{result?.eventAt&&<><br/><small>Evento: {new Date(result.eventAt).toLocaleString('pt-BR')}</small></>}{item.kind==='legacy'&&<small> · registro resumido anterior</small>}</td></tr>;
  })}</tbody></table></div>
  {loading&&<p role="status">Carregando histórico…</p>}
  {!loading&&!error&&!items.length&&<p>Nenhum registro de histórico disponível.</p>}
  {cursor!==null&&<button className="tracking-refresh" disabled={loading} onClick={()=>setBefore(cursor)}>Carregar registros anteriores</button>}
 </section>;
}
