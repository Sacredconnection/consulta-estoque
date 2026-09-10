import type {Product} from './inventory';
import {advanceCatalog,initialCursor,type CatalogCursor} from './sync-cursor';
import {IntegrationError,type Credentials} from './woo';

// One job and one atomic snapshot for both channels. Negative internal IDs
// isolate retail Woo IDs from wholesale IDs (including shared parent pools).
export async function advanceSacred(credentials:Credentials,previous:CatalogCursor,request:typeof fetch=fetch){
 const source=credentials.retail?.siteUrl??'';
 if(previous.sacredSources!==source)throw new IntegrationError('A configuração da Sacred mudou. Inicie uma nova sincronização.');
 const retail=previous.sacredPhase==='retail';
 const result=await advanceCatalog('sacred',retail?credentials.retail!:credentials,previous.sacredCursor??initialCursor(),request).catch(error=>{
  if(error instanceof IntegrationError)throw new IntegrationError((retail?'Varejo':'Atacado')+': '+error.message);
  throw error;
 });
 const records=result.records.map(p=>retail?{...p,key:p.key.startsWith('sku:')?p.key:p.key+':retail',stocks:p.stocks.map(s=>({...s,id:-s.id,parentId:s.parentId===undefined?undefined:-s.parentId,sourceChannel:'retail' as const}))}:{...p,stocks:p.stocks.map(s=>({...s,sourceChannel:'wholesale' as const}))});
 const offset=previous.sacredCompleted??0;
 const cursor:CatalogCursor={...previous,sacredCursor:result.cursor,productsDone:offset+result.cursor.productsDone,totalProducts:offset+result.cursor.totalProducts,records:previous.records+records.length};
 if(result.done&&!retail&&credentials.retail){
  cursor.sacredPhase='retail';cursor.sacredCompleted=result.cursor.productsDone;cursor.sacredCursor=initialCursor();
  return {cursor,records,done:false};
 }
 return {cursor,records,done:result.done};
}

export function combineSacredChannels(records:Product[]):Product[]{
 const groups=new Map<string,Product[]>(),others:Product[]=[];
 for(const p of records){
  const s=p.stocks[0];
  if(s?.storeId!=='sacred'||!p.sku.trim()){others.push(p);continue;}
  const key=p.sku.trim().toUpperCase();groups.set(key,[...(groups.get(key)??[]),p]);
 }
 for(const group of groups.values()){
  const wholesale=group.filter(p=>p.stocks[0].sourceChannel!=='retail'),retail=group.filter(p=>p.stocks[0].sourceChannel==='retail');
  if(wholesale.length!==1||retail.length!==1){others.push(...group);continue;}
  const a=wholesale[0],b=retail[0],x=a.stocks[0],y=b.stocks[0];
  // Both channels mirror the same QuickBooks inventory. Never add balances.
  // Wholesale is authoritative when known, including zero/negative values.
  const selected=x.quantity!==null?x:y;
  const other=selected===x?y:x;
  const weight=selected.grams==null&&!selected.shared&&selected.packaging!=='shared'&&!other.shared&&other.packaging!=='shared'&&(selected.quantityUnit??'un.')===(other.quantityUnit??'un.')?{grams:other.grams,packaging:other.packaging}:{};
  others.push({...a,stocks:[{...selected,...weight,categories:[...new Set([...(x.categories??a.category.split(',')),...(y.categories??b.category.split(','))])],sourceChannel:'combined'}]});
 }
 return others;
}
