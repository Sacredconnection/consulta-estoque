type CacheState={catalogReady?:boolean;needsSync?:boolean;sync?:{status:string}|null};
export function shouldStartSynchronization(source:CacheState,force=false){
 return source.sync?.status!=='running'&&(force||!source.catalogReady||!!source.needsSync);
}
