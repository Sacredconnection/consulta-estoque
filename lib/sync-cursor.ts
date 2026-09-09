import { wooPage, toRecord, IntegrationError, type Credentials, type WooProduct } from "./woo";
import type { Product, StoreId } from "./inventory";
import { CATALOG_VERSION } from "./catalog-policy";
import type { PagnierCursor } from "./pagnier";
export type CatalogCursor={catalogVersion:number;page:number;catalogDone:boolean;pending:{parent:WooProduct;page:number}[];productsSeen:number;productsDone:number;totalProducts:number;records:number;pagnier?:PagnierCursor;sourceRevision?:number};
export function initialCursor():CatalogCursor{return{catalogVersion:CATALOG_VERSION,page:1,catalogDone:false,pending:[],productsSeen:0,productsDone:0,totalProducts:0,records:0};}
const fields="id,name,sku,type,manage_stock,stock_quantity,stock_status,categories,attributes,variations,lang,translations";
export async function advanceCatalog(storeId:StoreId,credentials:Credentials,previous:CatalogCursor,request:typeof fetch=fetch){
 const cursor=structuredClone(previous),records:Product[]=[];
 const at=new Date().toISOString();
 if(!cursor.pending.length&&!cursor.catalogDone){
  if(cursor.page>100)throw new IntegrationError("O catálogo excede o limite de 10.000 produtos.");
  const result=await wooPage(storeId,credentials,"products",{per_page:"100",page:String(cursor.page),orderby:"id",order:"asc",_fields:fields},request);
  cursor.productsSeen+=result.count;
  cursor.productsDone+=result.count-result.items.length;
  cursor.totalProducts=result.total||cursor.totalProducts;
  cursor.catalogDone=(result.pages>0&&cursor.page>=result.pages)||result.count<100;
  cursor.page++;
  for(const p of result.items){
   if(p.type==="variable"){
    if(p.manage_stock===true)records.push(toRecord(storeId,p,at));
    cursor.pending.push({parent:p,page:1});
   }else{
    if(p.type!=="grouped"&&p.type!=="external")records.push(toRecord(storeId,p,at));
    cursor.productsDone++;
   }
  }
 }
 // At most six concurrent variation requests; each HTTP request remains bounded.
 const tasks=cursor.pending.splice(0,6);
 const responses=await Promise.all(tasks.map(t=>{
  if(t.page>100)throw new IntegrationError("Um produto excede o limite de 10.000 variações.");
  return wooPage(storeId,credentials,"products/"+t.parent.id+"/variations",{per_page:"100",page:String(t.page),orderby:"id",order:"asc",_fields:fields},request);
 }));
 tasks.forEach((task,i)=>{
  const result=responses[i];
  for(const variation of result.items)records.push(toRecord(storeId,variation,at,task.parent));
  if((result.pages>0&&task.page>=result.pages)||result.count<100)cursor.productsDone++;
  else cursor.pending.unshift({...task,page:task.page+1});
 });
 cursor.records+=records.length;
 if(cursor.records>50000)throw new IntegrationError("O catálogo excede o limite de 50.000 registros por loja.");
 return {cursor,records,done:cursor.catalogDone&&!cursor.pending.length};
}
