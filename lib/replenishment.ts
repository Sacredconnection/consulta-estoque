import {normalize,type Product,type Stock,type StoreId} from './inventory';
import {categoryKeys,stockCategoryPaths} from './category-tree';
export type SacredMinimum={sku:string;product:string;variation:string;minimum:number;unit?:'kg'|'L'};
export type ReplenishmentLine=SacredMinimum & {categories?:string[];current:number|null;order:number|null;kg:number|null;status:'order'|'ok'|'review';reason?:string};
export type ReplenishmentReport={generatedAt:string;lastSync:string|null;source:string;lines:ReplenishmentLine[];warning?:string;storeId?:StoreId;storeName?:string;configured?:boolean;selectedCategories?:string[];search?:string};
export function filterReplenishmentReport(report:ReplenishmentReport,categories:string[],search=''):ReplenishmentReport{
 const terms=normalize(search).trim().split(/\s+/).filter(Boolean);
 return {...report,selectedCategories:[...categories],search:search.trim(),lines:report.lines.filter(line=>(!categories.length||line.categories?.some(c=>categories.includes(c)))&&terms.every(term=>normalize(line.sku+' '+line.product+' '+line.variation).includes(term)))};
}
export function sacredReplenishment(minima:SacredMinimum[],products:Product[],storeId:StoreId='sacred'):ReplenishmentLine[]{
 if(storeId==='pagnier')return pagnierReplenishment(minima,products);
 const index=new Map<string,Stock[]>();
 for(const p of products){const key=p.sku.trim().toUpperCase();const stocks=index.get(key)??[];stocks.push(...p.stocks.filter(s=>s.storeId===storeId).map(s=>({...s,categories:categoryKeys(stockCategoryPaths(p,s)),productName:s.productName??p.name})));index.set(key,stocks);}
 return minima.filter(m=>(index.get(m.sku.toUpperCase())?.length??0)>0).map(original=>{
  const m={...original};
  const stocks=[...new Map((index.get(m.sku.toUpperCase())??[]).map(s=>[s.id,s])).values()];
  m.product=stocks[0].productName??m.product;m.variation=stocks[0].variationName??m.variation;
  const reason=stocks.some(s=>s.shared||s.packaging==='shared')?'Saldo compartilhado: conferir variação':stocks.length>1?'SKU duplicado na integração':stocks.some(s=>s.quantity===null)?'Quantidade não informada':stocks.some(s=>(s.quantityUnit??'un.')!=='un.')?'Unidade diferente da referência do CSV':undefined;
  const categories=[...new Set(stocks.flatMap(s=>s.categories??[]))];
  if(reason)return {...m,categories,current:null,order:null,kg:null,status:'review' as const,reason};
  const current=stocks[0].quantity!,order=Math.max(0,Math.ceil((m.minimum-Math.max(0,current))/10)*10);
  return {...m,categories,current,order,kg:stocks[0].grams==null?null:order*stocks[0].grams/1000,status:order?'order' as const:'ok' as const};
 }).sort((a,b)=>a.product.localeCompare(b.product,'pt-BR')||a.sku.localeCompare(b.sku,'pt-BR',{numeric:true}));
}

// Nomus has one stock ID per location, not a parent/variation relationship.
// Its eight-character product codes share six family characters; 00 is bulk.
function pagnierReplenishment(minima:SacredMinimum[],products:Product[]):ReplenishmentLine[]{
 const entries=products.flatMap(p=>p.stocks.filter(s=>s.storeId==='pagnier').map(s=>({p,s})));
 return minima.flatMap<ReplenishmentLine>(m=>{
  const sku=m.sku.trim().toUpperCase();
  const parent=entries.filter(e=>e.p.sku.trim().toUpperCase()===sku);
  const family=/^[A-Z]{4}\d{2}00$/.test(sku)?sku.slice(0,6):null;
  const members=entries.filter(e=>e.p.sku.trim().toUpperCase()===sku||(family!==null&&new RegExp('^'+family+'\\d{2}$').test(e.p.sku.trim().toUpperCase())));
  if(!members.length)return [];
  const unit=m.unit??(/\bkg$/i.test(m.product)?'kg':/\bL$/i.test(m.product)?'L':undefined);
  const categories=[...new Set(members.flatMap(({p,s})=>categoryKeys(stockCategoryPaths(p,s))))];
  const base={...m,unit,product:parent[0]?.s.productName??m.product,variation:unit?`Pai + filhos (${unit})`:m.variation,categories};
  const seen=new Set<number>();let current=0,reason:string|undefined;
  for(const {s,p} of members){
   if(seen.has(s.id))continue;seen.add(s.id);
   if(s.shared||s.packaging==='shared'){reason='Saldo compartilhado: conferir família';break;}
   if(s.quantity===null||!Number.isFinite(s.quantity)){reason='Quantidade não informada na família';break;}
   const source=(s.quantityUnit??'').toLowerCase();let factor:number|undefined;
   if(unit==='kg'){
    if(source==='kg')factor=1;
    else if(source==='g'||source==='gr')factor=0.001;
    else if(source==='un.'&&s.grams!=null&&Number.isFinite(s.grams)&&s.grams>0)factor=s.grams/1000;
   }else if(unit==='L'){
    if(['l','litro','litros'].includes(source))factor=1;
    else if(source==='ml')factor=0.001;
    else if(source==='un.'){
     // Volume is not mass: never use grams to infer liters.
     const volume=/\b(\d+(?:[.,]\d+)?)\s*(ml|litros?|l)\s*$/i.exec(s.productName??p.name);
     if(volume)factor=Number(volume[1].replace(',','.'))*(volume[2].toLowerCase()==='ml'?0.001:1);
    }
   }
   if(factor===undefined){reason=`Conversão para ${unit??'unidade do mínimo'} não informada: ${p.sku}`;break;}
   current+=Math.max(0,s.quantity)*factor;
  }
  if(reason)return [{...base,current:null,order:null,kg:null,status:'review' as const,reason}];
  // Only remove floating-point noise; no pack-size/whole-unit rounding.
  current=Number(current.toFixed(9));
  const order=Number(Math.max(0,m.minimum-current).toFixed(9));
  return [{...base,current,order,kg:unit==='kg'?order:null,status:order>0?'order' as const:'ok' as const}];
 }).sort((a,b)=>a.product.localeCompare(b.product,'pt-BR')||a.sku.localeCompare(b.sku,'pt-BR',{numeric:true}));
}
