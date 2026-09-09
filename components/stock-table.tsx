import type { CSSProperties } from 'react';
import { STORES, type StoreId, type Rule } from '@/lib/inventory';
import { totalMass, type Mass, type StockRow } from '@/lib/stock-table';
const storeStyle=(id:StoreId)=>({'--store-color':STORES.find(store=>store.id===id)!.color}) as CSSProperties;
const number=(n:number)=>n.toLocaleString('pt-BR',{maximumFractionDigits:6});
const massNumber=(n:number)=>n.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:6});
const kg=(mass:Mass)=>mass.kg===null?'N/D':massNumber(mass.kg)+(mass.partial?' *':'');
function rowGroup(row:StockRow){
 const cells=Object.values(row.stores);
 if(cells.some(cell=>cell.shared))return 'Saldos compartilhados';
 if(cells.length&&cells.every(cell=>cell.unit==='kg'||cell.unit==='g'))return 'Granel por peso';
 return 'Embalagens e unidades';
}
function ProductName({row,storeIds}:{row:StockRow;storeIds:StoreId[]}){
 const names=storeIds.flatMap(id=>row.stores[id]?.names??[]);
 const primary=[...new Set(names)].sort((a,b)=>a.length-b.length||a.localeCompare(b,'pt-BR'))[0]??row.product;
 return <><span className="product-primary">{primary}</span><details className="product-details"><summary>Ver detalhes</summary><dl>{storeIds.filter(id=>row.stores[id]).map(id=>{const cell=row.stores[id]!;return <div key={id}><dt>{STORES.find(store=>store.id===id)!.name}</dt><dd>{cell.names?.join(' / ')||row.product}</dd><dd>SKU: {cell.skus.join(' / ')||'Sem SKU'}</dd>{cell.locations.length>0&&<dd>{cell.locations.join(' · ')}</dd>}</div>;})}</dl></details></>;
}

export function StockTable({rows,storeIds,rule,title,totalRows=rows}:{rows:StockRow[];storeIds:StoreId[];rule:Rule;title?:string;totalRows?:StockRow[]}){
 if(!rows.length)return null;
 const totals=storeIds.map(id=>totalMass(totalRows.flatMap(row=>row.stores[id]?[row.stores[id]!]:[])));
 const grand=totalMass(totals.filter(t=>t.kg!==null||t.partial));
 const groups=['Embalagens e unidades','Granel por peso','Saldos compartilhados'].map(label=>({label,rows:rows.filter(row=>rowGroup(row)===label)})).filter(group=>group.rows.length);
 return <section className="stock-table-section">
  {title&&<h2>{title}</h2>}
  <div className="stock-table-scroll"><table className="stock-table" style={{minWidth:580+storeIds.length*210}}>
   <caption className="sr-only">Estoque por SKU e fonte, com totais em quilogramas</caption>
   <colgroup><col style={{width:125}}/><col/><col style={{width:120}}/>{storeIds.map(id=><col key={id} span={2} style={{width:105}}/>)}<col style={{width:105}}/></colgroup>
   <thead><tr><th rowSpan={2}>SKU</th><th rowSpan={2}>Produto</th><th rowSpan={2}>Apresentação</th>{storeIds.map(id=>{const store=STORES.find(s=>s.id===id)!;return <th key={id} colSpan={2} className="numeric store-column store-start store-band" style={storeStyle(id)}><span className="store-heading"><i style={{background:store.color}}/>{store.short}</span></th>;})}<th rowSpan={2} className="numeric kg-total">Total kg</th></tr><tr>{storeIds.map(id=><StoreHead key={id} storeId={id}/>)}</tr></thead>
   {groups.map(group=><tbody key={group.label}><tr className="stock-group"><th colSpan={4+storeIds.length*2} scope="rowgroup">{group.label}</th></tr>{group.rows.map(row=><tr key={row.key} className="stock-data-row"><td className="sku-cell">{row.sku}</td><td className="product-cell"><ProductName row={row} storeIds={storeIds}/></td><td className="presentation-cell">{row.presentation}</td>{storeIds.map(id=>{const cell=row.stores[id];return <StoreCells key={id} storeId={id} sku={row.sku} cell={cell} minimum={rule.minimum}/>;})}<td className="numeric kg-total">{kg(totalMass(storeIds.flatMap(id=>row.stores[id]?[row.stores[id]!]:[])))}</td></tr>)}</tbody>)}
   <tfoot><tr><th colSpan={3}>Total kg · todos os resultados{totalRows.length!==rows.length?' (todas as páginas)':''}</th>{totals.map((mass,i)=><TotalCells key={storeIds[i]} storeId={storeIds[i]} text={kg(mass)}/>)}<td className="numeric kg-total"><strong>{kg(grand)}</strong></td></tr>
   <tr><th colSpan={3}>Dos quais, granel (kg)</th>{totals.map((mass,i)=><TotalCells key={storeIds[i]} storeId={storeIds[i]} text={mass.bulkKg===null?'—':massNumber(mass.bulkKg)+(mass.partial?' *':'')}/>)}<td className="numeric kg-total">{grand.bulkKg===null?'—':massNumber(grand.bulkKg)+(grand.partial?' *':'')}</td></tr></tfoot>
  </table></div>
  <p className="table-note">Kg inclui apresentações com peso conhecido; granel também aparece separado. * Total parcial: saldos ou pesos desconhecidos e compartilhados ficam fora da soma. N/D = não informado; — = sem registro. Pagnier usa os saldos dos setores ativos que consideram disponibilidade.</p>
 </section>;
}
function StoreHead({storeId}:{storeId:StoreId}){return <><th className="numeric store-column store-start" style={storeStyle(storeId)}>Quantidade</th><th className="numeric store-column" style={storeStyle(storeId)}>Kg</th></>;}
function StoreCells({cell,minimum,storeId,sku}:{sku:string;storeId:StoreId;cell:StockRow['stores'][StoreId];minimum:number}){
 const level=!cell||cell.quantity===null?'unknown':cell.quantity<=0?'out':cell.unit==='un.'&&cell.quantity<=minimum?'low':'ok';
 const otherSkus=cell?.skus.filter(code=>code.toUpperCase()!==sku.toUpperCase())??[];
 return <><td className={'numeric stock-cell store-column store-start '+level} style={storeStyle(storeId)} title={cell?.locations.join('\n')}>{!cell?'—':cell.quantity===null?'N/D':(cell.unit==='kg'?massNumber(cell.quantity):number(cell.quantity))+' '+cell.unit}{cell?.partialQuantity?' *':''}{cell?.shared?<small>Compartilhado</small>:null}{otherSkus.length?<small className="source-sku" title="Código original nesta fonte">{otherSkus.join(' / ')}</small>:null}</td><td className="numeric store-column" style={storeStyle(storeId)}>{cell?kg(cell):'—'}</td></>;
}
function TotalCells({text,storeId}:{text:string;storeId:StoreId}){return <><td className="store-column store-start" style={storeStyle(storeId)}/><td className="numeric store-column" style={storeStyle(storeId)}><strong>{text}</strong></td></>;}
