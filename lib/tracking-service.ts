import {getDatabase} from './database';
import {parseTrackingSheet,type Shipment} from './tracking-sheet';
import {carrierReady,track,type TrackingResult} from './tracking-carriers';

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
  const candidates=state.rows.filter(row=>!row.issue&&carrierReady(row.carrier)&&(id?row.id===id:!row.historical&&row.result?.status!=='Entregue')&&(manual||!row.attemptedAt||Date.parse(row.attemptedAt)+state.interval*60000<=Date.now()))
   .sort((a,b)=>(a.attemptedAt??'').localeCompare(b.attemptedAt??'')).slice(0,5);
  const results=new Map<string,{result:TrackingResult|null;error:string|null;attemptedAt:string}>();
  for(const row of candidates){
   const cacheKey=row.carrier+':'+row.tracking;
   let update=results.get(cacheKey);
   if(!update){
    update={result:null,error:null,attemptedAt:new Date().toISOString()};
    try{update.result=await track(row.carrier,row.tracking);}catch(error){update.error=error instanceof Error?error.message:'Falha na consulta.';}
    results.set(cacheKey,update);
   }
   // Preserve the last successful result if a carrier fails.
   for(const target of state.rows.filter(r=>r.carrier===row.carrier&&r.tracking===row.tracking)){
    target.attemptedAt=update.attemptedAt;target.error=update.error;
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
 return {...state,history:undefined,carriers:[...new Set(state.rows.map(r=>r.carrier))].map(name=>({name,ready:carrierReady(name)}))};
}
