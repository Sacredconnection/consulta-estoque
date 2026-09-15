import {getDatabase} from './database';
import {parseTrackingSheet,type Shipment} from './tracking-sheet';
import {carrierReady,track,type TrackingResult} from './tracking-carriers';
import {track17Configured,track17Batch,trackingKey,type Track17Outcome} from './tracking-17track';
import {deliveredInSheet} from './tracking-policy';
import {historyStatement,migrateTrackingHistory,listTrackingHistory,type HistoryFilter} from './tracking-history';
import type {Statement} from './database';

export type TrackedShipment=Shipment&{result:TrackingResult|null;error:string|null;attemptedAt:string|null};
export type TrackingState={rows:TrackedShipment[];enabled:boolean;interval:number;importedAt:string|null;source:string;history:{id:string;at:string;status:string}[];historyVersion?:number};
const empty=():TrackingState=>({rows:[],enabled:false,interval:15,importedAt:null,source:'',history:[]});
const key='tracking-v1';
export async function readTracking():Promise<TrackingState>{
 const row=await getDatabase().prepare('SELECT payload FROM settings WHERE id=?').bind(key).first<{payload:string}>();
 return row?JSON.parse(row.payload):empty();
}
async function save(state:TrackingState,events:Statement[]=[]){
 // Consultation events and the current cache become visible atomically.
 await getDatabase().batch([...events,getDatabase().prepare('INSERT INTO settings (id,payload) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload').bind(key,JSON.stringify(state))]);
}
async function stateForWrite(){const state=await readTracking();await migrateTrackingHistory(state);return state;}
async function locked<T>(fn:()=>Promise<T>):Promise<T>{
 const db=getDatabase(),lease=String(Date.now()+240000);
 await db.prepare('INSERT OR IGNORE INTO settings(id,payload) VALUES (?,?)').bind('tracking-lock','0').run();
 const claimed=await db.prepare('UPDATE settings SET payload=? WHERE id=? AND CAST(payload AS INTEGER) < ?').bind(lease,'tracking-lock',Date.now()).run();
 if(!claimed.meta.changes)throw Error('Uma atualização de rastreio já está em andamento.');
 try{return await fn();}finally{await db.prepare('UPDATE settings SET payload=? WHERE id=? AND payload=?').bind('0','tracking-lock',lease).run();}
}
export async function importTracking(buffer:Buffer,name:string){
 const parsed=await parseTrackingSheet(buffer);
 return locked(async()=>{
  const state=await stateForWrite(),previous=new Map(state.rows.map(r=>[r.id,r]));
  state.rows=parsed.map(row=>({...row,result:previous.get(row.id)?.result??null,error:previous.get(row.id)?.error??null,attemptedAt:previous.get(row.id)?.attemptedAt??null}));
  state.importedAt=new Date().toISOString();state.source=name;
  const importId=crypto.randomUUID(),events:Statement[]=[],current=new Set(state.rows.map(r=>r.id));
  for(const row of state.rows)if(JSON.stringify(row)!==JSON.stringify(previous.get(row.id)))events.push(historyStatement({key:`import:${importId}:${row.id}`,row,at:state.importedAt,kind:'import'}));
  for(const row of previous.values())if(!current.has(row.id))events.push(historyStatement({key:`removed:${importId}:${row.id}`,row,at:state.importedAt,kind:'removed'}));
  await save(state,events);return state;
 });
}
export async function configureTracking(enabled:boolean,interval:number){
 if(![5,15,30,60].includes(interval))throw Error('Intervalo inválido.');
 return locked(async()=>{const state=await stateForWrite();state.enabled=enabled;state.interval=interval;await save(state);return state;});
}
export async function refreshTracking(manual=false,id?:string){
 return locked(async()=>{
  const state=await stateForWrite();if(!manual&&!state.enabled){await save(state);return state;}
  const unified=track17Configured();
  // A delivered duplicate also blocks the same parcel from being queried under another row.
  const deliveredKeys=new Set(state.rows.filter(row=>row.tracking&&deliveredInSheet(row)).map(trackingKey));
  const eligible=state.rows.filter(row=>!deliveredInSheet(row)&&!deliveredKeys.has(trackingKey(row))&&!row.issue&&carrierReady(row.carrier)&&(id?row.id===id:!row.historical&&row.result?.status!=='Entregue')&&(manual||!row.attemptedAt||Date.parse(row.attemptedAt)+state.interval*60000<=Date.now()))
   .sort((a,b)=>(a.attemptedAt??'').localeCompare(b.attemptedAt??''));
  const seen=new Set<string>();
  const candidates=eligible.filter(row=>{const key=trackingKey(row);if(seen.has(key))return false;seen.add(key);return true;}).slice(0,unified?120:5);
  for(let start=0;start<candidates.length;start+=unified?40:1){
   const batch=candidates.slice(start,start+(unified?40:1)),attemptedAt=new Date().toISOString(),runId=crypto.randomUUID(),events:Statement[]=[];
   let results:Map<string,Track17Outcome>;
   if(unified)results=await track17Batch(batch);
   else{
    const row=batch[0];let result:TrackingResult|null=null,error:string|null=null;
    try{result=await track(row.carrier,row.tracking);}catch(e){error=e instanceof Error?e.message:'Falha na consulta.';}
    results=new Map([[trackingKey(row),{result,error}]]);
   }
   // One response updates duplicate codes; failures retain the last valid result.
   for(const target of state.rows){
    const update=results.get(trackingKey(target));if(!update)continue;
    const previousStatus=target.result?.status??null;
    target.attemptedAt=attemptedAt;target.error=update.error;
    if(update.result){
     target.result=update.result;
    }
    events.push(historyStatement({key:`query:${runId}:${target.id}`,row:target,at:attemptedAt,kind:'consultation',response:update.result,error:update.error,provider:unified?'17TRACK':target.carrier,previousStatus,changed:!!update.result&&previousStatus!==update.result.status}));
   }
   await save(state,events);
  }
  if(!candidates.length)await save(state);
  return state;
 });
}
export async function trackingDashboard(){
 const state=await readTracking();
 const deliveredKeys=new Set(state.rows.filter(row=>row.tracking&&deliveredInSheet(row)).map(trackingKey));
 return {...state,rows:state.rows.map(row=>({...row,deliveredInSheet:deliveredInSheet(row),skipTracking:deliveredInSheet(row)||deliveredKeys.has(trackingKey(row))})),history:undefined,integration:{provider:track17Configured()?'17TRACK':'direct',configured:track17Configured()},carriers:[...new Set(state.rows.map(r=>r.carrier))].map(name=>({name,ready:carrierReady(name)}))};
}
export async function trackingHistory(filter:HistoryFilter={}){
 const state=await readTracking();
 if(state.historyVersion!==1)await locked(async()=>{await save(await stateForWrite());});
 return listTrackingHistory(filter);
}
