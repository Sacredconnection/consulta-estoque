import type {Product,Stock,StoreId} from './inventory';
import {categoryKeys,stockCategoryPaths} from './category-tree';
export type SacredMinimum={sku:string;product:string;variation:string;minimum:number};
export type ReplenishmentLine=SacredMinimum & {categories?:string[];current:number|null;order:number|null;kg:number|null;status:'order'|'ok'|'review';reason?:string};
export type ReplenishmentReport={generatedAt:string;lastSync:string|null;source:string;lines:ReplenishmentLine[];warning?:string;storeId?:StoreId;storeName?:string;configured?:boolean;selectedCategories?:string[]};
export function filterReplenishmentReport(report:ReplenishmentReport,categories:string[]):ReplenishmentReport{
 return {...report,selectedCategories:[...categories],lines:categories.length?report.lines.filter(line=>line.categories?.some(c=>categories.includes(c))):report.lines};
}
export function sacredReplenishment(minima:SacredMinimum[],products:Product[],storeId:StoreId='sacred'):ReplenishmentLine[]{
 const index=new Map<string,Stock[]>();
 for(const p of products){const key=p.sku.trim().toUpperCase();const stocks=index.get(key)??[];stocks.push(...p.stocks.filter(s=>s.storeId===storeId).map(s=>({...s,categories:categoryKeys(stockCategoryPaths(p,s)),productName:s.productName??p.name})));index.set(key,stocks);}
 return minima.filter(m=>(index.get(m.sku.toUpperCase())?.length??0)>0).map(original=>{
  const m={...original};
  const stocks=[...new Map((index.get(m.sku.toUpperCase())??[]).map(s=>[s.id,s])).values()];
  m.product=stocks[0].productName??m.product;m.variation=stocks[0].variationName??m.variation;
  const reason=stocks.some(s=>s.shared||s.packaging==='shared')?'Saldo compartilhado: conferir variação':stocks.length>1?'SKU duplicado na integração':stocks.some(s=>s.quantity===null)?'Quantidade não informada':stocks.some(s=>(s.quantityUnit??'un.')!=='un.')?'Unidade diferente da referência do CSV':undefined;
  const categories=[...new Set(stocks.flatMap(s=>s.categories??[]))];
  if(reason)return {...m,categories,current:null,order:null,kg:null,status:'review' as const,reason};
  const current=stocks[0].quantity!,order=Math.max(0,Math.ceil(m.minimum-Math.max(0,current)));
  return {...m,categories,current,order,kg:stocks[0].grams==null?null:order*stocks[0].grams/1000,status:order?'order' as const:'ok' as const};
 }).sort((a,b)=>a.product.localeCompare(b.product,'pt-BR')||a.sku.localeCompare(b.sku,'pt-BR',{numeric:true}));
}
