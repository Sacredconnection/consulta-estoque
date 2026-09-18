import {createHash} from 'node:crypto';
import {getDatabase,type Statement} from './database';
import type {TrackedShipment,TrackingState} from './tracking-service';
import type {TrackingResult} from './tracking-carriers';

export type HistoryKind='baseline'|'legacy'|'import'|'removed'|'consultation';
export type HistoryEntry={id:number;shipmentId:string;order:string;tracking:string;carrier:string;at:string;kind:HistoryKind;status:string|null;changed:boolean;data:{shipment:TrackedShipment|null;response:TrackingResult|null;error:string|null;provider:string|null;previousStatus:string|null;legacyStatus?:string}};
export type HistoryFilter={shipmentId?:string;tracking?:string;order?:string;before?:number;limit?:number};

// Idempotent initialization also supports deployments before the migration job.
export async function ensureTrackingHistory(){
 const db=getDatabase();
 await db.batch([
  db.prepare(`CREATE TABLE IF NOT EXISTS tracking_history (
   id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
   event_key TEXT NOT NULL, shipment_id TEXT NOT NULL, order_ref TEXT NOT NULL,
   tracking TEXT NOT NULL, carrier TEXT NOT NULL, recorded_at TEXT NOT NULL,
   kind TEXT NOT NULL, status TEXT, status_changed INTEGER NOT NULL DEFAULT 0,
   payload TEXT NOT NULL
  )`),
  db.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_tracking_history_event ON tracking_history(event_key)'),
  db.prepare('CREATE INDEX IF NOT EXISTS idx_tracking_history_shipment ON tracking_history(shipment_id,id)'),
  db.prepare('CREATE INDEX IF NOT EXISTS idx_tracking_history_tracking ON tracking_history(tracking,id)'),
  db.prepare('CREATE INDEX IF NOT EXISTS idx_tracking_history_order ON tracking_history(order_ref,id)'),
 ]);
}
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function historyStatement(input:{key:string;row:TrackedShipment|null;shipmentId?:string;at:string;kind:HistoryKind;response?:TrackingResult|null;error?:string|null;provider?:string|null;previousStatus?:string|null;status?:string|null;changed?:boolean;legacyStatus?:string}):Statement {
 const row=input.row;
 const data:HistoryEntry['data']={shipment:row,response:input.response??null,error:input.error??null,provider:input.provider??null,previousStatus:input.previousStatus??null,...(input.legacyStatus?{legacyStatus:input.legacyStatus}:{})};
 return getDatabase().prepare(`INSERT OR IGNORE INTO tracking_history
  (event_key,shipment_id,order_ref,tracking,carrier,recorded_at,kind,status,status_changed,payload)
  VALUES (?,?,?,?,?,?,?,?,?,?)`).bind(input.key,row?.id??input.shipmentId??'',row?.order??'',row?.tracking??'',row?.carrier??'',input.at,input.kind,input.status??input.response?.status??row?.result?.status??null,input.changed?1:0,JSON.stringify(data));
}
export async function migrateTrackingHistory(state:TrackingState){
 if(state.historyVersion===1)return;
 await ensureTrackingHistory();
 const db=getDatabase(),rows=new Map(state.rows.map(row=>[row.id,row]));
 const statements:Statement[]=[];
 for(const row of state.rows)statements.push(historyStatement({key:'baseline:'+hash(row),row,at:new Date().toISOString(),kind:'baseline'}));
 for(const event of state.history??[]){
  const row=rows.get(event.id);
  // Legacy events only recorded the status; do not backfill a modern response into an old event.
  statements.push(historyStatement({key:'legacy:'+hash(event),row:row?{...row,result:null,error:null,attemptedAt:null}:null,shipmentId:event.id,at:event.at,kind:'legacy',status:event.status,legacyStatus:event.status,changed:true}));
 }
 // Interrupted migrations are safe to retry because event keys are deterministic.
 for(let i=0;i<statements.length;i+=100)await db.batch(statements.slice(i,i+100));
 state.historyVersion=1;state.history=[];
}

export async function listTrackingHistory(filter:HistoryFilter={}){
 const conditions:string[]=[],values:(string|number)[]=[];
 for(const [column,value] of [['shipment_id',filter.shipmentId],['tracking',filter.tracking],['order_ref',filter.order]] as const){if(value){conditions.push(`${column}=?`);values.push(value);}}
 if(filter.before!==undefined){conditions.push('id<?');values.push(filter.before);}
 const limit=Math.max(1,Math.min(200,filter.limit??50));
 const rows=await getDatabase().prepare(`SELECT * FROM tracking_history ${conditions.length?'WHERE '+conditions.join(' AND '):''} ORDER BY id DESC LIMIT ?`).bind(...values,limit+1).all<{
  id:number;shipment_id:string;order_ref:string;tracking:string;carrier:string;recorded_at:string;kind:HistoryKind;status:string|null;status_changed:number;payload:string;
 }>();
 const items:HistoryEntry[]=rows.results.slice(0,limit).map(row=>({id:row.id,shipmentId:row.shipment_id,order:row.order_ref,tracking:row.tracking,carrier:row.carrier,at:row.recorded_at,kind:row.kind,status:row.status,changed:!!row.status_changed,data:JSON.parse(row.payload)}));
 return {items,nextCursor:rows.results.length>limit?items.at(-1)!.id:null};
}
