import {getDatabase} from './database';
import {environmentConnections} from './connections-env';
import {STORES,type Product} from './inventory';
import {wooPage,IntegrationError,type Credentials} from './woo';
import {attachCategoryTree,type CategoryNode} from './category-tree';

type TreeCache={id:string;url:string;nodes:CategoryNode[];checkedAt:number;error?:string};
export async function cachedCategoryTrees():Promise<TreeCache[]>{
 const result=await getDatabase().prepare("SELECT payload FROM settings WHERE id LIKE 'category_tree:%'").all<{payload:string}>();
 return result.results.map(r=>JSON.parse(r.payload));
}
export async function readCategoryTree(storeId:'sacred'|'maya'|'sc23',credentials:Credentials,request:typeof fetch=fetch):Promise<CategoryNode[]>{
 const nodes:CategoryNode[]=[];
 for(let page=1;page<=20;page++){
  const result=await wooPage(storeId,credentials,'products/categories',{per_page:'100',page:String(page),hide_empty:'false',orderby:'id',order:'asc',_fields:'id,name,parent'},request);
  for(const node of result.items){if(typeof node.name!=='string'||!Number.isSafeInteger(node.parent)||(node.parent??-1)<0)throw new IntegrationError('Hierarquia de categorias inválida.');nodes.push({id:node.id,name:node.name,parent:node.parent!});}
  if((result.pages>0&&page>=result.pages)||result.count<100)return nodes;
 }
 throw new IntegrationError('Limite de categorias excedido.');
}
export async function refreshCategoryTrees(){
 const db=getDatabase(),cached=await cachedCategoryTrees(),now=Date.now();
 const sources=environmentConnections(process.env).flatMap(c=>[
  {id:c.id+':wholesale',storeId:c.id,credentials:c,url:'https://'+STORES.find(s=>s.id===c.id)!.host},
  ...(c.id==='sacred'&&c.retail?[{id:'sacred:retail',storeId:c.id,credentials:c.retail,url:c.retail.siteUrl}]:[]),
 ]);
 await Promise.all(sources.map(async source=>{
  const previous=cached.find(c=>c.id===source.id&&c.url===source.url);
  if(previous&&now-previous.checkedAt<(previous.error?300000:1800000))return;
  let value:TreeCache;
  try{value={id:source.id,url:source.url,nodes:await readCategoryTree(source.storeId,source.credentials),checkedAt:now};}
  catch{value={id:source.id,url:source.url,nodes:previous?.nodes??[],checkedAt:now,error:'Não foi possível atualizar a hierarquia de categorias.'};}
  await db.prepare('INSERT INTO settings (id,payload) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload').bind('category_tree:'+source.id,JSON.stringify(value)).run();
 }));
}
export function applyCachedCategoryTrees(product:Product,trees:TreeCache[]):Product{
 return {...product,stocks:product.stocks.map(stock=>{
  const tree=trees.find(t=>t.id===stock.storeId+':'+(stock.sourceChannel==='retail'?'retail':'wholesale'));
  return attachCategoryTree({...product,stocks:[stock]},tree?.nodes??[]).stocks[0];
 })};
}
