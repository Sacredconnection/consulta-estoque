import { STORES, type Product, type StoreId, type Stock } from "./inventory";
export type WooProduct={id:number;name?:string;sku?:string;type?:string;manage_stock?:boolean|"parent";stock_quantity?:number|null;stock_status?:string;categories?:{name:string}[];attributes?:{option:string}[];variations?:number[]};
export type Credentials={key:string;secret:string};
export class IntegrationError extends Error {}
export async function wooPage(storeId:StoreId,credentials:Credentials,path:string,params:Record<string,string>={},request:typeof fetch=fetch){
 const store=STORES.find(s=>s.id===storeId);if(!store)throw new IntegrationError("Loja inválida.");
 const url=new URL("https://"+store.host+"/wp-json/wc/v3/"+path);
 for(const [key,value] of Object.entries(params))url.searchParams.set(key,value);
 let response:Response;
 try{response=await request(url,{headers:{Authorization:"Basic "+btoa(credentials.key+":"+credentials.secret),Accept:"application/json"},redirect:"manual",signal:AbortSignal.timeout(20000)});}
 catch{throw new IntegrationError("A loja não respondeu em até 20 segundos. Verifique a disponibilidade da API.");}
 if(response.status>=300&&response.status<400)throw new IntegrationError("A API redirecionou a consulta. Verifique o endereço da loja; as credenciais não foram encaminhadas.");
 if(!response.ok){
  const detail=await response.json().catch(()=>null) as {code?:unknown;message?:unknown}|null;
  const code=typeof detail?.code==="string"&&/^[a-z_]{1,80}$/.test(detail.code)?detail.code:"";
  const remoteMessage=typeof detail?.message==="string"?detail.message.toLowerCase():"";
  let reason=response.status===401||response.status===403?"A loja recusou as credenciais. Verifique a chave de leitura e as regras de acesso.":response.status===429?"A loja limitou as consultas. Aguarde e sincronize novamente.":"Falha na API WooCommerce.";
  if(remoteMessage.includes("consumer key is invalid"))reason="O WooCommerce informou que a Consumer key é inválida.";
  else if(remoteMessage.includes("invalid signature"))reason="O WooCommerce informou assinatura inválida. Confira o par de chaves.";
  else if(code==="woocommerce_rest_cannot_view")reason="O WooCommerce não permitiu listar produtos com o usuário associado à chave.";
  else if(remoteMessage.includes("consumer key is missing"))reason="O WooCommerce informou que não recebeu a Consumer key. Verifique o encaminhamento da autenticação no servidor.";
  throw new IntegrationError("HTTP "+response.status+(code?" · "+code:"")+". "+reason);
 }
 let body:unknown;try{body=await response.json();}catch{throw new IntegrationError("A loja retornou um formato inválido. Verifique o acesso à API REST.");}
 if(!Array.isArray(body)||body.some(p=>!p||!Number.isSafeInteger(p.id)||p.id<=0))throw new IntegrationError("O catálogo retornado pela loja não é válido.");
 return {items:body as WooProduct[],pages:Number(response.headers.get("X-WP-TotalPages")||0)};
}
export async function* wooPages(storeId:StoreId,credentials:Credentials,path:string,request:typeof fetch=fetch){
 for(let page=1;page<=100;page++){
  const {items,pages}=await wooPage(storeId,credentials,path,{per_page:"100",page:String(page),orderby:"id",order:"asc",_fields:"id,name,sku,type,manage_stock,stock_quantity,stock_status,categories,attributes,variations"},request);
  yield items;
  if((pages>0&&page>=pages)||items.length<100)return;
 }
 throw new IntegrationError("O catálogo excede o limite de 10.000 itens por consulta. Nenhuma atualização parcial foi publicada.");
}
export function toRecord(storeId:StoreId,p:WooProduct,at:string,parent?:WooProduct):Product{
 const shared=!!parent&&(p.manage_stock==="parent"||(!p.manage_stock&&parent.manage_stock===true));
 const source=shared?parent!:p;
 const quantity=(source.manage_stock===true||shared)&&typeof source.stock_quantity==="number"&&Number.isFinite(source.stock_quantity)?source.stock_quantity:null;
 const suffix=parent?(p.attributes??[]).map(a=>a.option).filter(Boolean).join(" / "):"";
 const name=parent?parent.name+(suffix?" · "+suffix:" · variação "+p.id):p.name||"Produto "+p.id;
 // A shared parent pool must stay separate from a SKU for a physical variation.
 const pool=!parent&&p.type==="variable"&&p.manage_stock===true;
 const sku=(p.sku??"").trim();
 const key=pool?"pool:"+storeId+":"+p.id:sku?"sku:"+sku:"id:"+storeId+":"+p.id;
 const stock:Stock={storeId,id:p.id,quantity,status:source.stock_status??"unknown",updatedAt:at,...(shared?{shared:true}:{})};
 return {key,sku,name:name+(pool?" · estoque do produto pai":""),category:(parent?.categories??p.categories)?.map(c=>c.name).join(", ")||"Sem categoria",stocks:[stock]};
}
export async function readCatalog(storeId:StoreId,credentials:Credentials,at:string,request:typeof fetch=fetch){
 const records:Product[]=[];const ids=new Set<number>();
 function add(p:Product){const id=p.stocks[0].id;if(ids.has(id))throw new IntegrationError("O catálogo mudou durante a leitura. Sincronize novamente.");ids.add(id);records.push(p);if(records.length>15000)throw new IntegrationError("Limite de 15.000 produtos e variações por loja excedido.");}
 for await(const page of wooPages(storeId,credentials,"products",request)){
  for(const product of page){
   if(product.type==="variable"){
    if(product.manage_stock===true)add(toRecord(storeId,product,at));
    for await(const variants of wooPages(storeId,credentials,"products/"+product.id+"/variations",request)){
     for(const variant of variants)add(toRecord(storeId,variant,at,product));
    }
   }else if(product.type!=="grouped"&&product.type!=="external"){add(toRecord(storeId,product,at));}
  }
 }
 const counts=new Map<string,number>();for(const r of records)counts.set(r.key,(counts.get(r.key)??0)+1);
 return records.map(r=>(counts.get(r.key)??0)>1?{...r,key:"duplicate:"+storeId+":"+r.stocks[0].id,name:r.name+" · SKU duplicado"}:r);
}
export function mergeCatalog(records:Product[]){
 const grouped=new Map<string,Product>();
 for(const r of records){const existing=grouped.get(r.key);if(existing)existing.stocks.push(...r.stocks);else grouped.set(r.key,{...r,stocks:[...r.stocks]});}
 return [...grouped.values()].sort((a,b)=>a.name.localeCompare(b.name,"pt-BR"));
}
