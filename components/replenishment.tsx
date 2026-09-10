"use client";
import {useEffect,useState} from 'react';
import type {ReplenishmentReport} from '@/lib/replenishment';
export function Replenishment(){
 const [report,setReport]=useState<ReplenishmentReport|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[exporting,setExporting]=useState(false),[view,setView]=useState<'order'|'review'|'all'>('order');
 async function load(){setBusy(true);setError('');try{const r=await fetch('/api/replenishment',{cache:'no-store'});const d=await r.json();if(!r.ok)throw Error(d.error);setReport(d);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 useEffect(()=>{void load();},[]);
 const order=report?.lines.filter(r=>r.status==='order')??[],review=report?.lines.filter(r=>r.status==='review')??[];
 const lines=view==='order'?order:view==='review'?review:report?.lines??[];
 async function save(format:'pdf'|'xlsx'){if(!report)return;setExporting(true);try{const {exportReplenishment}=await import('@/lib/replenishment-export');await exportReplenishment(report,format);}catch{setError('Não foi possível exportar. Tente novamente.');}finally{setExporting(false);}}
 return <section className="replenishment-view"><header><div className="eyebrow">EXCLUSIVO SACRED</div><h1>Reposição de Estoque</h1><p>Pedido calculado para recompor os mínimos de 3 meses cadastrados para a Sacred.</p></header>
 <div className="replenishment-actions"><button onClick={()=>void load()} disabled={busy||exporting}>{busy?'Calculando…':'Recalcular pedido'}</button><button onClick={()=>void save('pdf')} disabled={!order.length||busy||exporting}>Exportar PDF</button><button onClick={()=>void save('xlsx')} disabled={!order.length||busy||exporting}>Exportar Excel</button></div>
 {error&&<p role="alert" className="connection-error">{error}</p>}
 {report&&<><p className="table-note">Estoque Sacred: {report.lastSync?new Date(report.lastSync).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}):'Não disponível'} (Brasília). Base: {report.source}.</p>{report.warning&&<p role="alert" className="notice">{report.warning}</p>}
 <div className="replenishment-summary"><span><strong>{order.length}</strong> SKUs para repor</span><span><strong>{order.reduce((n,r)=>n+r.order!,0).toLocaleString('pt-BR')}</strong> unidades</span><span><strong>{order.reduce((n,r)=>n+(r.kg??0),0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:6})}</strong> kg{order.some(r=>r.kg===null)?' (parcial)':''}</span><span><strong>{review.length}</strong> para revisão</span></div>
 <p className="table-note">Repor = mínimo − disponível. Saldos negativos contam como zero. Itens sem saldo confiável ficam para revisão e não entram no pedido. Os arquivos incluem o pedido completo, independentemente da visualização abaixo.</p>
 <div className="replenishment-actions" aria-label="Visualização da reposição">{([['order','Pedido'],['review','Para revisão'],['all','Todos os mínimos']] as const).map(([id,label])=><button key={id} aria-pressed={view===id} onClick={()=>setView(id)}>{label}</button>)}</div>
 {lines.length?<div className="replenishment-scroll"><table><thead><tr>{['SKU Sacred','Produto','Apresentação','Atual (un.)','Mínimo (un.)','Repor (un.)','Kg','Observação'].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{lines.map(r=><tr key={r.sku}><td><code>{r.sku}</code></td><td>{r.product}</td><td>{r.variation}</td><td>{r.current??'N/D'}</td><td>{r.minimum}</td><td><strong>{r.order??'Revisar'}</strong></td><td>{r.kg===null?'N/D':r.kg.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:6})}</td><td>{r.reason??(r.status==='ok'?'Mínimo atendido':'')}</td></tr>)}</tbody></table></div>:<p className="catalog-empty">{view==='order'?'Nenhum item com necessidade de reposição calculável. Confira os itens para revisão.':'Nenhum item nesta visualização.'}</p>}</>}
 </section>;
}
