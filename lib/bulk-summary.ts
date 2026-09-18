import type {Product,Stock,StoreId} from './inventory';
import {productEquivalence} from './product-equivalences';

export const BULK_SIZES=[100,250,500] as const;
export type BulkSize=typeof BULK_SIZES[number];
export type BulkAmount={quantity:number|null;kg:number|null;partial:boolean};
export type BulkGroup={key:string;name:string;code:string;search:string;sizes:Partial<Record<BulkSize,Partial<Record<StoreId,BulkAmount>>>>};
const normalize=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export function sumBulk(values:BulkAmount[]):BulkAmount{
 const known=values.filter(value=>value.quantity!==null);
 return {quantity:known.length?known.reduce((sum,value)=>sum+value.quantity!,0):null,kg:known.length?known.reduce((sum,value)=>sum+value.kg!,0):null,partial:values.some(value=>value.partial||value.quantity===null)};
}
function family(product:Product,stock:Stock){
 const equivalent=productEquivalence(product,stock);
 const code=equivalent?.id.match(/^(RA[A-Z]{2}\d{2})-/)?.[1];
 if(code)return {key:'family:'+code,code};
 // Do not guess variant weights or remove arbitrary numeric SKU suffixes.
 return {key:stock.parentId!==undefined?'parent:'+stock.storeId+':'+stock.parentId:'product:'+product.key,code:''};
}
export function buildBulkGroups(products:Product[],storeIds:StoreId[]):BulkGroup[]{
 const allowed=new Set(storeIds),seen=new Set<string>();
 const groups=new Map<string,BulkGroup>();
 for(const product of products)for(const stock of product.stocks){
  if(!allowed.has(stock.storeId)||!BULK_SIZES.includes(stock.grams as BulkSize)||(stock.quantityUnit??'un.')!=='un.'||stock.packaging!=='bulk'||stock.shared)continue;
  const identity=stock.storeId+':'+stock.id;
  if(seen.has(identity))continue;seen.add(identity);
  const {key,code}=family(product,stock),name=stock.productName??product.name;
  let group=groups.get(key);
  if(!group){group={key,name,code,search:'',sizes:{}};groups.set(key,group);}
  if(name.length<group.name.length)group.name=name;
  group.search+=' '+normalize([name,product.sku,product.category,code].join(' '));
  const size=stock.grams as BulkSize,values=group.sizes[size]??{};
  const known=stock.quantity!==null&&Number.isFinite(stock.quantity);
  const value:BulkAmount={quantity:known?stock.quantity:null,kg:known?Math.max(0,stock.quantity!)*size/1000:null,partial:!known};
  values[stock.storeId]=values[stock.storeId]?sumBulk([values[stock.storeId]!,value]):value;
  group.sizes[size]=values;
 }
 return [...groups.values()].sort((a,b)=>a.name.localeCompare(b.name,'pt-BR',{numeric:true}));
}
export function bulkTotal(groups:BulkGroup[],storeId?:StoreId){
 return sumBulk(groups.flatMap(group=>BULK_SIZES.flatMap(size=>storeId?(group.sizes[size]?.[storeId]?[group.sizes[size]![storeId]!]:[]):Object.values(group.sizes[size]??{}))));
}
