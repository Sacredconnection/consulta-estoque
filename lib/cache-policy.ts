type CacheState={catalogReady?:boolean;needsSync?:boolean;sync?:{status:string}|null};
export function shouldStartSynchronization(source:CacheState,force=false){
 return source.sync?.status!=='running'&&(force||!source.catalogReady||!!source.needsSync);
}

export function scheduledRefreshDue(source:CacheState & {lastSync?:string|null},interval:number,now=Date.now()){
 return shouldStartSynchronization(source) || source.sync?.status!=='running'&&(!source.lastSync||!Number.isFinite(Date.parse(source.lastSync))||now-Date.parse(source.lastSync)>=interval*60000);
}
