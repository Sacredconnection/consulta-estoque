import type {Product} from './inventory';
export const isPagnierLabel=(name:string)=>name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes('etiqueta');
export function visibleCatalog(products:Product[]):Product[]{
 return products.map(p=>({...p,stocks:p.stocks.filter(s=>s.storeId!=='pagnier'||!isPagnierLabel(s.productName??p.name))})).filter(p=>p.stocks.length);
}
