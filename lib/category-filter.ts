import {normalize, type Product, type Stock, type StoreId} from './inventory';
export function stockCategories(product:Product,stock:Stock):string[]{
 return [...new Set((stock.categories??product.category.split(',')).map(c=>c.trim()).filter(Boolean))];
}
export function availableCategories(products:Product[],storeId:StoreId):string[]{
 const categories=new Map<string,string>();
 for(const p of products)for(const s of p.stocks.filter(s=>s.storeId===storeId))for(const c of stockCategories(p,s))categories.set(normalize(c),c);
 return [...categories.values()].sort((a,b)=>a.localeCompare(b,'pt-BR'));
}
export function filterCategory(products:Product[],storeId:StoreId,category:string):Product[]{
 const target=normalize(category.trim());
 return products.map(p=>({...p,stocks:p.stocks.filter(s=>s.storeId===storeId&&stockCategories(p,s).some(c=>normalize(c)===target))})).filter(p=>p.stocks.length);
}
