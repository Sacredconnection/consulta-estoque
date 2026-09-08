import { STORES, type StoreId } from "./inventory";
export type EnvironmentValues=Record<string,string|undefined>;
export type EnvironmentConnection={id:StoreId;key:string;secret:string};
const runtimeNames:Record<StoreId,string>={sacred:"WOO_SACRED",maya:"WOO_MAYA",sc23:"WOO_SC23"};
// Match legacy prefixes by their configured hostname, never by a guessed shop name.
export function canonicalStoreEnvironment(values:EnvironmentValues):Record<string,string>{
 const output:Record<string,string>={};
 for(const store of STORES){
  const name=runtimeNames[store.id];
  if(values[name+"_KEY"]&&values[name+"_SECRET"]){
   output[name+"_KEY"]=values[name+"_KEY"]!.trim();output[name+"_SECRET"]=values[name+"_SECRET"]!.trim();continue;
  }
  for(const variable of Object.keys(values).filter(k=>k.endsWith("_SITE_URL"))){
   let url:URL;try{url=new URL(values[variable]!);}catch{continue;}
   if(url.protocol!=="https:"||url.hostname!==store.host||url.username||url.password||url.port)continue;
   const prefix=variable.slice(0,-"_SITE_URL".length);
   const key=values[prefix+"_CONSUMER_KEY"]?.trim(),secret=values[prefix+"_CONSUMER_SECRET"]?.trim();
   if(key&&secret){output[name+"_KEY"]=key;output[name+"_SECRET"]=secret;break;}
  }
 }
 return output;
}
export function environmentConnections(values:EnvironmentValues):EnvironmentConnection[]{
 const canonical=canonicalStoreEnvironment(values);
 return STORES.flatMap(store=>{const name=runtimeNames[store.id],key=canonical[name+"_KEY"],secret=canonical[name+"_SECRET"];return key&&secret?[{id:store.id,key,secret}]:[];});
}
