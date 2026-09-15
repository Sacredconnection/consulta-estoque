import {getDatabase} from './database';
import {parseTrackingSheet,type Shipment} from './tracking-sheet';
import {carrierReady,track,type TrackingResult} from './tracking-carriers';
import {track17Configured,track17Batch,trackingKey,type Track17Outcome} from './tracking-17track';

export type TrackedShipment=Shipment&{result:TrackingResult|null;error:string|null;attemptedAt:string|null};
export type TrackingState={rows:TrackedShipment[];enabled:boolean;interval:number;importedAt:string|null;source:string;history:{id:string;at:string;status:string}[]};
const empty=():TrackingState=>({rows:[],enabled:false,interval:15,importedAt:null,source:'',history:[]});
const key='tracking-v1';
export async function readTracking():Promise<TrackingState>{
 const row=await getDatabase().prepare('SELECT payload FROM settings WHERE id=?').bind(key).first<{payload:string}>();
 return row?JSON.parse(row.payload):empty();
}
async function save(state:TrackingState){await getDatabase().prepare('INSERT INTO settings (id,payload) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload').bind(key,JSON.stringify(state)).run();}
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
  const state=await readTracking(),previous=new Map(state.rows.map(r=>[r.id,r]));
  state.rows=parsed.map(row=>({...row,result:previous.get(row.id)?.result??null,error:previous.get(row.id)?.error??null,attemptedAt:previous.get(row.id)?.attemptedAt??null}));
  state.importedAt=new Date().toISOString();state.source=name;await save(state);return state;
 });
}
export async function configureTracking(enabled:boolean,interval:number){
 if(![5,15,30,60].includes(interval))throw Error('Intervalo inválido.');
 return locked(async()=>{const state=await readTracking();state.enabled=enabled;state.interval=interval;await save(state);return state;});
}
export async function refreshTracking(manual=false,id?:string){
 return locked(async()=>{
  const state=await readTracking();if(!manual&&!state.enabled)return state;
  const unified=track17Configured();
  const eligible=state.rows.filter(row=>!row.issue&&carrierReady(row.carrier)&&(id?row.id===id:!row.historical&&row.result?.status!=='Entregue')&&(manual||!row.attemptedAt||Date.parse(row.attemptedAt)+state.interval*60000<=Date.now()))
   .sort((a,b)=>(a.attemptedAt??'').localeCompare(b.attemptedAt??''));
  const seen=new Set<string>();
  const candidates=eligible.filter(row=>{const key=trackingKey(row);if(seen.has(key))return false;seen.add(key);return true;}).slice(0,unified?120:5);
  for(let start=0;start<candidates.length;start+=unified?40:1){
   const batch=candidates.slice(start,start+(unified?40:1)),attemptedAt=new Date().toISOString();
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
    target.attemptedAt=attemptedAt;target.error=update.error;
    if(update.result){
     if(target.result?.status!==update.result.status)state.history.push({id:target.id,at:update.result.checkedAt,status:update.result.status});
     target.result=update.result;
    }
   }
   state.history=state.history.slice(-2000);await save(state);
  }
  return state;
 });
}
export async function trackingDashboard(){
 const state=await readTracking();
 return {...state,history:undefined,integration:{provider:track17Configured()?'17TRACK':'direct',configured:track17Configured()},carriers:[...new Set(state.rows.map(r=>r.carrier))].map(name=>({name,ready:carrierReady(name)}))};
}
