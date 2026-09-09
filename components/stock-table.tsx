import { STORES, type StoreId, type Rule } from '@/lib/inventory';
import { totalMass, type Mass, type StockRow } from '@/lib/stock-table';
const number=(n:number)=>n.toLocaleString('pt-BR',{maximumFractionDigits:6});
const kg=(mass:Mass)=>mass.kg===null?'N/D':number(mass.kg)+(mass.partial?' *':'');

export function StockTable({rows,storeIds,rule,title,totalRows=rows}:{rows:StockRow[];storeIds:StoreId[];rule:Rule;title?:string;totalRows?:StockRow[]}){
 if(!rows.length)return null;
 const totals=storeIds.map(id=>totalMass(totalRows.flatMap(row=>row.stores[id]?[row.stores[id]!]:[])));
 const grand=totalMass(totals.filter(t=>t.kg!==null||t.partial));
 return <section className="stock-table-section">
  {title&&<h2>{title}</h2>}
  <div className="stock-table-scroll"><table className="stock-table" style={{minWidth:Math.max(820,520+storeIds.length*210)}}>
   <caption className="sr-only">Estoque por SKU e fonte, com totais em quilogramas</caption>
   <thead><tr><th rowSpan={2}>SKU</th><th rowSpan={2}>Produto</th><th rowSpan={2}>Apresentação</th><th rowSpan={2}>Categoria</th>{storeIds.map(id=>{const store=STORES.find(s=>s.id===id)!;return <th key={id} colSpan={2} className="numeric"><span className="store-heading"><i style={{background:store.color}}/>{store.short}</span></th>;})}<th rowSpan={2} className="numeric kg-total">Total kg</th></tr><tr>{storeIds.map(id=><StoreHead key={id}/>)}</tr></thead>
   <tbody>{rows.map(row=><tr key={row.key}><td className="sku-cell">{row.sku}</td><td>{row.product}</td><td>{row.presentation}</td><td>{row.category||'—'}</td>{storeIds.map(id=>{const cell=row.stores[id];return <StoreCells key={id} cell={cell} minimum={rule.minimum}/>;})}<td className="numeric kg-total">{kg(totalMass(storeIds.flatMap(id=>row.stores[id]?[row.stores[id]!]:[])))}</td></tr>)}</tbody>
   <tfoot><tr><th colSpan={4}>Total kg · todos os resultados{totalRows.length!==rows.length?' (todas as páginas)':''}</th>{totals.map((mass,i)=><TotalCells key={storeIds[i]} text={kg(mass)}/>)}<td className="numeric kg-total"><strong>{kg(grand)}</strong></td></tr>
   <tr><th colSpan={4}>Dos quais, granel (kg)</th>{totals.map((mass,i)=><TotalCells key={storeIds[i]} text={mass.bulkKg===null?'—':number(mass.bulkKg)+(mass.partial?' *':'')}/>)}<td className="numeric kg-total">{grand.bulkKg===null?'—':number(grand.bulkKg)+(grand.partial?' *':'')}</td></tr></tfoot>
  </table></div>
  <p className="table-note">Kg inclui apresentações com peso conhecido; granel também aparece separado. * Total parcial: saldos ou pesos desconhecidos e compartilhados ficam fora da soma. N/D = não informado; — = sem registro. Pagnier usa os saldos dos setores ativos que consideram disponibilidade.</p>
 </section>;
}
function StoreHead(){return <><th className="numeric">Quantidade</th><th className="numeric">Kg</th></>;}
function StoreCells({cell,minimum}:{cell:StockRow['stores'][StoreId];minimum:number}){
 const level=!cell||cell.quantity===null?'unknown':cell.quantity<=0?'out':cell.unit==='un.'&&cell.quantity<=minimum?'low':'ok';
 return <><td className={'numeric stock-cell '+level} title={cell?.locations.join('\n')}>{!cell?'—':cell.quantity===null?'N/D':number(cell.quantity)+' '+cell.unit}{cell?.partialQuantity?' *':''}{cell?.shared?<small>comp.</small>:null}</td><td className="numeric">{cell?kg(cell):'—'}</td></>;
}
function TotalCells({text}:{text:string}){return <><td/><td className="numeric"><strong>{text}</strong></td></>;}
