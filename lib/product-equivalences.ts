import type { Product, Stock } from './inventory';

type Equivalence={id:string;grams:number;unit:string};

// Rapé families use RA + two letters + two digits. Maya appends grams;
// Sacred/Pagnier append a variant ID whose meaning varies between families.
// Use the actual presentation weight, never a universal numeric suffix map.

export function productEquivalence(product:Pick<Product,'sku'>,stock:Stock):Equivalence|undefined{
 if(stock.shared||stock.packaging==='shared'||stock.grams==null||!Number.isFinite(stock.grams)||stock.grams<=0)return;
 const sku=product.sku.trim().toUpperCase(),unit=stock.quantityUnit??'un.';
 const maya=/^(RA[A-Z]{2}\d{2})-(\d+(?:\.\d+)?)$/.exec(sku);
 if(stock.storeId==='maya'&&maya&&unit==='un.'&&Math.abs(Number(maya[2])-stock.grams)<0.000001){
  return {id:maya[1]+'-'+Number(maya[2]),grams:stock.grams,unit};
 }
 if(stock.storeId!=='sacred'&&stock.storeId!=='pagnier')return;
 const coded=/^(RA[A-Z]{2}\d{2})(\d{2})$/.exec(sku);
 if(!coded)return;
 if(unit==='kg'&&coded[2]==='00'&&stock.grams===1000)return {id:coded[1]+'-KG',grams:1000,unit};
 if(unit!=='un.'||coded[2]==='00')return;
 return {id:coded[1]+'-'+stock.grams,grams:stock.grams,unit};
}

export function equivalenceSearchText(product:Product):string{
 return product.stocks.map(stock=>productEquivalence(product,stock)?.id??'').join(' ');
}

// Expand actual catalog matches so translated names and either SKU find every
// equivalent presentation, without inventing variant IDs for other sources.
export function includeEquivalentProducts(products:Product[],matches:Product[]):Product[]{
 const ids=new Set(matches.flatMap(p=>p.stocks.map(s=>productEquivalence(p,s)?.id).filter(Boolean)));
 const selected=new Set(matches);
 return products.filter(p=>selected.has(p)||p.stocks.some(s=>{const id=productEquivalence(p,s)?.id;return id!==undefined&&ids.has(id);}));
}
