"use client";
import {useMemo,useState} from 'react';
import {Search,X} from 'lucide-react';
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
 const groups=useMemo(()=>buildBulkGroups(products,storeIds),[products,storeIds]);
 const visible=useMemo(()=>{
  const terms=query.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().split(/\s+/).filter(Boolean);
  return groups.filter(group=>terms.every(term=>group.search.includes(term)));
 },[groups,query]);
 const partial=bulkTotal(visible).partial;
 return <section className="bulk-view">
  <header className="bulk-heading"><h1>Granel simplificado</h1><label className="bulk-search"><Search size={17}/><span className="sr-only">Buscar produto no granel</span><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Buscar produto ou código"/>{query&&<button type="button" onClick={()=>setQuery('')} aria-label="Limpar busca de granel"><X size={16}/></button>}</label></header>
  {!ready?<p className="bulk-empty" role="status">Carregando estoque…</p>:!storeIds.length?<p className="bulk-empty">Selecione uma empresa nos filtros.</p>:!visible.length?<p className="bulk-empty">{query?'Nenhum produto corresponde à busca.':'Nenhum rapé em potes de 100 g, 250 g ou 500 g no estoque carregado.'}</p>:<>
   <div className="bulk-scroll" tabIndex={0} role="region" aria-label="Estoque de granel por empresa"><table className="bulk-table">
    <caption className="sr-only">Rapé em potes de 100, 250 e 500 gramas em unidades. A primeira linha soma seu peso em quilogramas; cada produto também mostra seu subtotal em quilogramas.</caption>
    <thead><tr><th scope="col">Produto / pote</th>{storeIds.map(id=><th scope="col" key={id}>{STORES.find(store=>store.id===id)!.short}</th>)}</tr></thead>
    <tbody><tr className="bulk-grand-total"><th scope="row">Total granel <small>kg · 100, 250 e 500 g{query?' · resultado da busca':''}</small></th>{storeIds.map(id=>{const total=bulkTotal(visible,id);return <td key={id}>{amount(total.kg===null&&!total.partial?undefined:total,true)}</td>;})}</tr></tbody>
    {visible.map(group=><tbody key={group.key}><tr className="bulk-product"><th scope="row"><span>{group.name}</span><small>{group.code?group.code+' · ':''}Total kg</small></th>{storeIds.map(id=>{const total=bulkTotal([group],id);return <td key={id}>{amount(total.kg===null&&!total.partial?undefined:total,true)}</td>;})}</tr>{BULK_SIZES.map(size=><tr className="bulk-size" key={size}><th scope="row">{size} g</th>{storeIds.map(id=><td key={id}>{amount(group.sizes[size]?.[id])}</td>)}</tr>)}</tbody>)}
   </table></div>
   <p className="bulk-note">Potes em unidades. Totais em kg. — Sem registro.{partial?' N/D Não informado. * Soma parcial.':''}</p>
  </>}
 </section>;
}
