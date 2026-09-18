type CacheState={catalogReady?:boolean;needsSync?:boolean;sync?:{status:string;updatedAt?:string}|null};
export function shouldStartSynchronization(source:CacheState,force=false){
 return source.sync?.status!=='running'&&(force||!source.catalogReady||!!source.needsSync);
}

export function scheduledRefreshDue(source:CacheState & {lastSync?:string|null},interval:number,now=Date.now()){
 // Failed sources wait at least one normal interval instead of restarting every cron tick.
 if(source.sync?.status==='failed'&&source.sync.updatedAt&&now-Date.parse(source.sync.updatedAt)<Math.max(interval,30)*60000)return false;
 return shouldStartSynchronization(source) || source.sync?.status!=='running'&&(!source.lastSync||!Number.isFinite(Date.parse(source.lastSync))||now-Date.parse(source.lastSync)>=interval*60000);
}
