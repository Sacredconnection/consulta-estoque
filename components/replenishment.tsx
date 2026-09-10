"use client";
import {CategoryFilter} from './category-filter';
import {useEffect,useState,useRef,useMemo} from 'react';
import {AlertCircle,ArrowRight,ChevronDown,Download,FileSpreadsheet,FileText,LoaderCircle,RefreshCw,Search,X} from 'lucide-react';
import {STORES,type StoreId} from '@/lib/inventory';
import {filterReplenishmentReport,type ReplenishmentReport} from '@/lib/replenishment';

const number=(value:number)=>value.toLocaleString('pt-BR');
const weight=(value:number)=>value.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:6});
const date=(value:string)=>new Date(value).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});

export function Replenishment({storeIds}:{storeIds:StoreId[]}){
 const [storeId,setStoreId]=useState<StoreId>('sacred'),sequence=useRef(0);
 const [selectedCategories,setSelectedCategories]=useState<string[]>([]),[query,setQuery]=useState('');
 const company=STORES.find(s=>s.id===storeId)!.short;
 const [report,setReport]=useState<ReplenishmentReport|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[exporting,setExporting]=useState(false),[view,setView]=useState<'order'|'review'|'all'>('order');
 const [exportOpen,setExportOpen]=useState(false),exportBox=useRef<HTMLDivElement>(null),exportButton=useRef<HTMLButtonElement>(null);
 async function load(){
  const request=++sequence.current;setBusy(true);setError('');
  try{const r=await fetch('/api/replenishment?storeId='+storeId,{cache:'no-store'});const d=await r.json();if(!r.ok)throw Error(d.error||'Não foi possível carregar o pedido.');if(request===sequence.current)setReport(d);}
  catch(e){if(request===sequence.current)setError((e as Error).message);}
  finally{if(request===sequence.current)setBusy(false);}
 }
 useEffect(()=>{setView('order');void load();return()=>{sequence.current++;};},[storeId]);
 useEffect(()=>{
  if(!exportOpen)return;
  function outside(event:PointerEvent){if(!exportBox.current?.contains(event.target as Node))setExportOpen(false);}
  function escape(event:KeyboardEvent){if(event.key==='Escape'){setExportOpen(false);exportButton.current?.focus();}}
  document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape);
  return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape);};
 },[exportOpen]);
 const categories=useMemo(()=>[...new Set(report?.lines.flatMap(line=>line.categories??[])??[])].sort((a,b)=>a.localeCompare(b,'pt-BR')),[report]);
 const filteredReport=report?filterReplenishmentReport(report,selectedCategories,query):null;
 const all=filteredReport?.lines??[],order=all.filter(r=>r.status==='order'),review=all.filter(r=>r.status==='review');
 const lines=view==='order'?order:view==='review'?review:all;
 const knownWeight=order.filter(r=>r.kg!==null),unknownWeight=order.length-knownWeight.length;
 async function save(format:'pdf'|'xlsx'){
  if(!filteredReport||!order.length)return;setExportOpen(false);setExporting(true);setError('');
  try{const {exportReplenishment}=await import('@/lib/replenishment-export');await exportReplenishment(filteredReport,format);}
  catch{setError('Não foi possível exportar. Tente novamente.');}
  finally{setExporting(false);exportButton.current?.focus();}
 }
 return <section className="replenishment-view">
  <header className="replenishment-heading"><div><h1>Reposição de estoque</h1><p>Confira as necessidades e prepare seu pedido.</p>
   <div className="replenishment-freshness"><span>{report?.lastSync?`Estoque ${company}: ${date(report.lastSync)} (Brasília)`:'Aguardando estoque da empresa'}</span><button type="button" onClick={()=>void load()} disabled={busy||exporting}><RefreshCw size={14} className={busy?'spin':''}/>{busy?'Recalculando…':'Recalcular'}</button></div>
  </div><div className="replenishment-export-box" ref={exportBox}>
   <button ref={exportButton} type="button" className="replenishment-export-primary" aria-expanded={exportOpen} aria-controls="replenishment-export-options" disabled={!order.length||busy||exporting} onClick={()=>setExportOpen(open=>!open)}>{exporting?<LoaderCircle size={17} className="spin"/>:<Download size={17}/>} {exporting?'Exportando…':'Exportar pedido'}<ChevronDown size={16}/></button>
   {exportOpen&&<div id="replenishment-export-options" className="replenishment-export-options" role="group" aria-label="Formatos de exportação"><p>Pedido com os filtros atuais</p><button type="button" onClick={()=>void save('pdf')}><FileText size={18}/>Exportar PDF</button><button type="button" onClick={()=>void save('xlsx')}><FileSpreadsheet size={18}/>Exportar Excel</button></div>}
  </div></header>

  <div className="replenishment-filter-panel"><label className="replenishment-company">Empresa<select value={storeId} disabled={exporting} onChange={event=>{sequence.current++;setReport(null);setError('');setSelectedCategories([]);setQuery('');setExportOpen(false);setStoreId(event.target.value as StoreId);}}>{STORES.filter(s=>s.id==='sacred'||storeIds.includes(s.id)).map(s=><option key={s.id} value={s.id}>{s.short}</option>)}</select></label>
   <CategoryFilter key={storeId} id="replenishment-category" company={company} categories={categories} selected={selectedCategories} disabled={busy||exporting||!report||report.configured===false} onChange={setSelectedCategories} compact/>
  </div>
  {error&&<p role="alert" className="notice replenishment-alert"><AlertCircle size={18}/>{error}</p>}
  {report?.warning&&<p role="alert" className="notice replenishment-alert"><AlertCircle size={18}/>{report.warning}</p>}
  {!report&&busy&&<div role="status" className="replenishment-loading"><LoaderCircle className="spin" size={22}/>Calculando o pedido…</div>}
  {report?.configured===false&&<div className="replenishment-empty"><h2>Mínimos ainda não cadastrados</h2><p>Cadastre os mínimos de {company} para gerar um pedido. Os mínimos da Sacred são exclusivos dela.</p></div>}
  {report&&report.configured!==false&&<>
   <div className="replenishment-metrics" aria-label="Resumo do pedido"><div className="replenishment-metric"><span>Produtos a repor</span><strong>{number(order.length)}</strong><small>SKUs no pedido</small></div>
    <div className="replenishment-metric"><span>Unidades</span><strong>{number(order.reduce((n,r)=>n+r.order!,0))}</strong><small>Quantidade para reposição</small></div>
    <div className="replenishment-metric"><span>Peso estimado</span><strong>{knownWeight.length?weight(knownWeight.reduce((n,r)=>n+r.kg!,0)):order.length?'—':'0,00'}<span> kg</span></strong><small>{unknownWeight?`Parcial · ${unknownWeight} ${unknownWeight===1?'produto sem peso':'produtos sem peso'}`:'Peso dos produtos a repor'}</small></div>
    <button type="button" className={'replenishment-metric replenishment-pending'+(review.length?' has-pending':'')} onClick={()=>setView('review')} aria-label={`Ver ${review.length} ${review.length===1?'pendência':'pendências'}`}><span>Pendências</span><strong>{number(review.length)}</strong><small>{review.length?'Conferir antes de pedir':'Nenhum item para revisão'}<ArrowRight size={14}/></small></button>
   </div>
   <div className="replenishment-table-toolbar"><nav className="replenishment-status-tabs" aria-label="Visualização da reposição">{([['order','Pedido',order.length],['review','Revisar',review.length],['all','Todos',all.length]] as const).map(([id,label,count])=><button type="button" key={id} aria-pressed={view===id} onClick={()=>setView(id)}>{label}<span>{number(count)}</span></button>)}</nav>
    <label className="replenishment-search"><Search size={17}/><span className="sr-only">Buscar produto ou SKU na reposição</span><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Buscar produto ou SKU…" disabled={exporting}/>{query&&<button type="button" onClick={()=>setQuery('')} aria-label="Limpar busca"><X size={16}/></button>}</label>
   </div>
   <div className="replenishment-results" aria-busy={busy}>
    {lines.length?<div className="replenishment-scroll" tabIndex={0} role="region" aria-label="Tabela do pedido de reposição"><table><caption className="sr-only">{company}: {lines.length} produtos na visualização atual</caption><colgroup><col style={{width:135}}/><col/><col style={{width:120}}/><col style={{width:95}}/><col style={{width:95}}/><col style={{width:105}}/><col style={{width:105}}/><col style={{width:200}}/></colgroup><thead><tr>{['SKU','Produto','Apresentação','Atual (un.)','Mínimo (un.)','Repor (un.)','Peso (kg)','Observação'].map((h,i)=><th key={h} scope="col" className={i===5?'replenishment-order-cell':undefined}>{h}</th>)}</tr></thead><tbody>{lines.map(r=><tr key={r.sku}><td><code>{r.sku}</code></td><td className="replenishment-product">{r.product}</td><td>{r.variation||'—'}</td><td className={r.current!==null&&r.current<=0?'replenishment-out':undefined}>{r.current===null?'N/D':number(r.current)}</td><td>{number(r.minimum)}</td><td className="replenishment-order-cell"><strong>{r.order===null?'Revisar':number(r.order)}</strong></td><td>{r.kg===null?'N/D':weight(r.kg)}</td><td><span className={r.status==='review'?'replenishment-review-reason':'replenishment-row-note'}>{r.reason??(r.status==='ok'?'Mínimo atendido':'—')}</span></td></tr>)}</tbody></table></div>:<div className="replenishment-empty"><Search size={24}/><h2>{query?'Nenhum produto encontrado':'Nenhum item nesta visualização'}</h2><p>{query?'Tente outro nome ou SKU, ou limpe a busca.':view==='order'?'Não há reposição calculável para estes filtros. Confira as pendências, se houver.':'Experimente outra visualização ou ajuste as categorias.'}</p>{query&&<button type="button" onClick={()=>setQuery('')}>Limpar busca</button>}</div>}
   </div>
   <footer className="replenishment-footer"><span>{number(lines.length)} {lines.length===1?'produto exibido':'produtos exibidos'}{query?' · Busca aplicada ao pedido e à exportação':''}</span><details className="replenishment-method"><summary>Como o pedido é calculado</summary><p>Repor = mínimo − disponível. Saldos negativos contam como zero. Itens sem saldo confiável ficam para revisão e não entram no pedido.</p><p>A categoria pai inclui todas as subcategorias. Adicionar uma subcategoria refina esse ramo; outras seleções são acumuladas.</p><p>PDF e Excel respeitam a empresa, as categorias e a busca. Incluem o pedido e os itens para revisão, independentemente da visualização aberta. O peso é parcial quando algum produto não tem peso informado.</p><p>Base dos mínimos: <strong>{report.source}</strong>.</p></details></footer>
  </>}
 </section>;
}
