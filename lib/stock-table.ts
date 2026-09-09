import type { Product, Stock, StoreId } from './inventory';

export type Mass={kg:number|null;partial:boolean;bulkKg:number|null};
export type StockCell=Mass & {quantity:number|null;unit:string;partialQuantity:boolean;shared:boolean;positions:number;locations:string[]};
export type StockRow={key:string;sku:string;product:string;presentation:string;category:string;search:string;stores:Partial<Record<StoreId,StockCell>>};
const normalized=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export function stockMass(stocks:Stock[]):Mass{
 const calculable=stocks.filter(s=>!s.shared&&s.packaging!=='shared'&&s.quantity!==null&&s.grams!=null);
 return {kg:calculable.length?calculable.reduce((sum,s)=>sum+Math.max(0,s.quantity!)*s.grams!/1000,0):null,partial:calculable.length<stocks.length,bulkKg:calculable.some(s=>s.packaging==='bulk')?calculable.filter(s=>s.packaging==='bulk').reduce((sum,s)=>sum+Math.max(0,s.quantity!)*s.grams!/1000,0):null};
}
export function totalMass(cells:Mass[]):Mass{
 const known=cells.filter(c=>c.kg!==null),bulk=cells.filter(c=>c.bulkKg!==null);
 return {kg:known.length?known.reduce((sum,c)=>sum+c.kg!,0):null,partial:cells.some(c=>c.partial||c.kg===null),bulkKg:bulk.length?bulk.reduce((sum,c)=>sum+c.bulkKg!,0):null};
}
export function buildStockRows(products:Product[]):StockRow[]{
 const groups=new Map<string,{sku:string;names:Set<string>;presentations:Set<string>;categories:Set<string>;stores:Map<StoreId,Stock[]>}>();
 for(const product of products){
  const sku=product.sku.trim(),key=sku?'sku:'+sku.toUpperCase():'key:'+product.key;
  let group=groups.get(key);if(!group){group={sku:sku||'Sem SKU',names:new Set(),presentations:new Set(),categories:new Set(),stores:new Map()};groups.set(key,group);}
  if(product.category)group.categories.add(product.category);
  for(const stock of product.stocks){
   group.names.add(stock.productName??product.name);group.presentations.add(stock.variationName||(stock.grams!=null?stock.grams+' g':'Unidade'));
   const stocks=group.stores.get(stock.storeId)??[];stocks.push(stock);group.stores.set(stock.storeId,stocks);
  }
 }
 return [...groups].map(([key,group])=>{
  const stores:StockRow['stores']={};
  for(const [storeId,stocks] of group.stores){
   const seen=new Set<string>();const unique=stocks.filter(s=>{const id=s.shared||s.packaging==='shared'?'pool:'+(s.parentId??s.id):'id:'+s.id;if(seen.has(id))return false;seen.add(id);return true;});
   const known=unique.filter(s=>s.quantity!==null),units=new Set(unique.map(s=>s.quantityUnit??'un.'));
   stores[storeId]={...stockMass(unique),quantity:known.length&&units.size===1?known.reduce((sum,s)=>sum+s.quantity!,0):null,unit:units.size===1?[...units][0]:'unidades distintas',partialQuantity:known.length<unique.length,shared:unique.some(s=>s.shared||s.packaging==='shared'),positions:unique.length,locations:[...new Set(unique.map(s=>s.location).filter((s):s is string=>!!s))]};
  }
  const product=[...group.names].join(' / '),presentation=[...group.presentations].join(' / '),category=[...group.categories].join(', ');
  return {key,sku:group.sku,product,presentation,category,stores,search:normalized([group.sku,product,presentation,category].join(' '))};
 }).sort((a,b)=>a.sku.localeCompare(b.sku,'pt-BR',{numeric:true}));
}
