import type {Product,Stock} from './inventory';
import {normalize} from './inventory';
export type CategoryNode={id:number;name:string;parent:number};
export const CATEGORY_SEPARATOR=' › ';
export function categoryPath(node:CategoryNode,nodes:CategoryNode[]):string[]{
 const byId=new Map(nodes.map(n=>[n.id,n])),seen=new Set<number>(),path:string[]=[];
 let current:CategoryNode|undefined=node;
 while(current){if(seen.has(current.id))return [node.name];seen.add(current.id);path.unshift(current.name);current=byId.get(current.parent);}
 return path;
}
export function stockCategoryPaths(product:Product,stock:Stock):string[][]{
 return stock.categoryPaths??(stock.categories??product.category.split(',')).map(c=>[c.trim()]).filter(c=>c[0]);
}
export function categoryKeys(paths:string[][]):string[]{
 return [...new Set(paths.flatMap(path=>path.map((_,i)=>path.slice(0,i+1).join(CATEGORY_SEPARATOR))))];
}
export function attachCategoryTree(product:Product,nodes:CategoryNode[]):Product{
 return {...product,stocks:product.stocks.map(stock=>{
  const names=stock.categories??product.category.split(',').map(c=>c.trim());
  const paths:string[][]=[];
  for(let i=0;i<names.length;i++){
   const matches=nodes.filter(n=>stock.categoryIds?.[i]!==undefined?n.id===stock.categoryIds[i]:normalize(n.name)===normalize(names[i]));
   paths.push(matches.length===1?categoryPath(matches[0],nodes):[names[i]]);
  }
  return {...stock,categoryPaths:paths.filter(p=>p[0])};
 })};
}
