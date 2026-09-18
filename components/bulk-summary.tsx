"use client";
import {useMemo,useState} from 'react';
import {Download,LoaderCircle,Search,X} from 'lucide-react';
import {STORES,type Product,type StoreId} from '@/lib/inventory';
import {BULK_SIZES,buildBulkGroups,bulkTotal,type BulkAmount} from '@/lib/bulk-summary';
const number=(value:number)=>value.toLocaleString('pt-BR',{maximumFractionDigits:3});
function amount(value:BulkAmount|undefined,mass=false){
 if(!value)return '—';
 const n=mass?value.kg:value.quantity;
 return n===null?'N/D':number(n)+(value.partial?' *':'');
}
export function BulkSummary({products,storeIds,ready}:{products:Product[];storeIds:StoreId[];ready:boolean}){
 const [query,setQuery]=useState('');
 const [exporting,setExporting]=useState(false),[exportError,setExportError]=useState('');
 const groups=useMemo(()=>buildBulkGroups(products,storeIds),[products,storeIds]);
 const visible=useMemo(()=>{
  const terms=query.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().split(/\s+/).filter(Boolean);
  return groups.filter(group=>terms.every(term=>group.search.includes(term)));
 },[groups,query]);
 const partial=bulkTotal(visible).partial;
 async function download(){
  setExporting(true);setExportError('');
  try{const {exportBulkExcel}=await import('@/lib/bulk-export');await exportBulkExcel(visible,storeIds,query);}
  catch{setExportError('Não foi possível exportar. Tente novamente.');}
  finally{setExporting(false);}
 }
 return <section className="bulk-view">
  <header className="bulk-heading"><h1>Granel simplificado</h1><div className="bulk-actions"><label className="bulk-search"><Search size={17}/><span className="sr-only">Buscar produto no granel</span><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Buscar produto ou código"/>{query&&<button type="button" onClick={()=>setQuery('')} aria-label="Limpar busca de granel"><X size={16}/></button>}</label><button type="button" className="stock-export" disabled={exporting||!ready||!visible.length||!storeIds.length} onClick={()=>void download()}>{exporting?<LoaderCircle size={16} className="spin"/>:<Download size={16}/>} {exporting?'Exportando…':'Exportar Excel'}</button></div></header>
  {exportError&&<p role="alert" className="bulk-note">{exportError}</p>}
  {!ready?<p className="bulk-empty" role="status">Carregando estoque…</p>:!storeIds.length?<p className="bulk-empty">Selecione uma empresa nos filtros.</p>:!visible.length?<p className="bulk-empty">{query?'Nenhum produto corresponde à busca.':'Nenhum rapé em granel ou potes de 100 g, 250 g ou 500 g no estoque carregado.'}</p>:<>
   <div className="bulk-scroll" tabIndex={0} role="region" aria-label="Estoque de granel por empresa"><table className="bulk-table">
    <caption className="sr-only">Rapé a granel da Pagnier em kg e potes de 100, 250 e 500 gramas em unidades. A primeira linha soma seu peso em quilogramas; cada produto também mostra seu subtotal em quilogramas.</caption>
    <thead><tr><th scope="col">Produto / pote</th>{storeIds.map(id=><th scope="col" key={id}>{STORES.find(store=>store.id===id)!.short}</th>)}</tr></thead>
    <tbody><tr className="bulk-grand-total"><th scope="row">Total granel <small>kg · granel + potes{query?' · resultado da busca':''}</small></th>{storeIds.map(id=>{const total=bulkTotal(visible,id);return <td key={id}>{amount(total.kg===null&&!total.partial?undefined:total,true)}</td>;})}</tr></tbody>
    {visible.map(group=><tbody key={group.key}><tr className="bulk-product"><th scope="row"><span>{group.name}</span><small>{group.code?group.code+' · ':''}Total kg</small></th>{storeIds.map(id=>{const total=bulkTotal([group],id);return <td key={id}>{amount(total.kg===null&&!total.partial?undefined:total,true)}</td>;})}</tr>{group.loose.pagnier&&storeIds.includes("pagnier")&&<tr className="bulk-size"><th scope="row">Granel (kg)</th>{storeIds.map(id=><td key={id}>{amount(group.loose[id],true)}</td>)}</tr>}{BULK_SIZES.map(size=><tr className="bulk-size" key={size}><th scope="row">{size} g</th>{storeIds.map(id=><td key={id}>{amount(group.sizes[size]?.[id])}</td>)}</tr>)}</tbody>)}
   </table></div>
   <p className="bulk-note">Granel Pagnier em kg. Potes em unidades. Totais incluem ambos. — Sem registro.{partial?' N/D Não informado. * Soma parcial.':''}</p>
  </>}
 </section>;
}
