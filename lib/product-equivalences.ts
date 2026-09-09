import type { Product, Stock, StoreId } from './inventory';

type Equivalence={id:string;name:string;grams:number;unit:string;aliases:Partial<Record<StoreId,string[]>>};
// Confirmed RAYA02 family. Add further families explicitly; never infer identity
// from similar names or from a package weight alone.
export const PRODUCT_EQUIVALENCES:Equivalence[]=[
 ...([{grams:5,suffix:'09'},{grams:10,suffix:'04'},{grams:20,suffix:'05'},{grams:50,suffix:'06'},{grams:100,suffix:'03'},{grams:250,suffix:'02'},{grams:500,suffix:'01'}]).map(({grams,suffix})=>({
  id:'RAYA02-'+grams,name:'Yawanawa Força Feminina',grams,unit:'un.',
  aliases:{maya:['RAYA02-'+grams],sacred:['RAYA02'+suffix,...(grams===10?['ARAYA0204']:[])],pagnier:['RAYA02'+suffix]},
 })),
 {id:'RAYA02-KG',name:'Yawanawa Força Feminina',grams:1000,unit:'kg',aliases:{pagnier:['RAYA0200']}},
];

export function productEquivalence(product:Pick<Product,'sku'>,stock:Stock):Equivalence|undefined{
 if(stock.shared||stock.packaging==='shared'||stock.grams==null)return;
 const sku=product.sku.trim().toUpperCase();
 return PRODUCT_EQUIVALENCES.find(rule=>rule.unit===(stock.quantityUnit??'un.')&&Math.abs(rule.grams-stock.grams!)<0.000001&&rule.aliases[stock.storeId]?.includes(sku));
}

export function equivalenceSearchText(product:Product):string{
 return product.stocks.map(stock=>{const rule=productEquivalence(product,stock);return rule?[rule.name,rule.id,...Object.values(rule.aliases).flat()].join(' '):'';}).join(' ');
}
