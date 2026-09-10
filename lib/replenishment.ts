import type {Product,Stock} from './inventory';
export type SacredMinimum={sku:string;product:string;variation:string;minimum:number};
export type ReplenishmentLine=SacredMinimum & {current:number|null;order:number|null;kg:number|null;status:'order'|'ok'|'review';reason?:string};
export type ReplenishmentReport={generatedAt:string;lastSync:string|null;source:string;lines:ReplenishmentLine[];warning?:string};
export function sacredReplenishment(minima:SacredMinimum[],products:Product[]):ReplenishmentLine[]{
 const index=new Map<string,Stock[]>();
 for(const p of products){const key=p.sku.trim().toUpperCase();const stocks=index.get(key)??[];stocks.push(...p.stocks.filter(s=>s.storeId==='sacred'));index.set(key,stocks);}
 return minima.map(m=>{
  const stocks=[...new Map((index.get(m.sku.toUpperCase())??[]).map(s=>[s.id,s])).values()];
  const reason=!stocks.length?'SKU não encontrado na Sacred':stocks.some(s=>s.shared||s.packaging==='shared')?'Saldo compartilhado: conferir variação':stocks.length>1?'SKU duplicado na Sacred':stocks.some(s=>s.quantity===null)?'Quantidade não informada':stocks.some(s=>(s.quantityUnit??'un.')!=='un.')?'Unidade diferente da referência do CSV':undefined;
  if(reason)return {...m,current:null,order:null,kg:null,status:'review' as const,reason};
  const current=stocks[0].quantity!,order=Math.max(0,Math.ceil(m.minimum-Math.max(0,current)));
  return {...m,current,order,kg:stocks[0].grams==null?null:order*stocks[0].grams/1000,status:order?'order' as const:'ok' as const};
 }).sort((a,b)=>a.product.localeCompare(b.product,'pt-BR')||a.sku.localeCompare(b.sku,'pt-BR',{numeric:true}));
}
