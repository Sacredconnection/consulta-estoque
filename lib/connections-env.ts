import { STORES, type WooStoreId } from "./inventory";
export type EnvironmentValues=Record<string,string|undefined>;
export type EnvironmentConnection={id:WooStoreId;key:string;secret:string;retail?:{siteUrl:string;key:string;secret:string};configurationError?:string};
export function sacredRetailEnvironment(values:EnvironmentValues){
 const names=['SACRED_RETAIL_SITE_URL','SACRED_RETAIL_CONSUMER_KEY','SACRED_RETAIL_CONSUMER_SECRET'];
 if(!names.some(n=>values[n]?.trim()))return;
 const [siteUrl,key,secret]=names.map(n=>values[n]?.trim());
 if(!siteUrl||!key||!secret)throw new Error('Preencha SACRED_RETAIL_SITE_URL, SACRED_RETAIL_CONSUMER_KEY e SACRED_RETAIL_CONSUMER_SECRET.');
 let url:URL;try{url=new URL(siteUrl);}catch{throw new Error('SACRED_RETAIL_SITE_URL deve ser uma URL HTTPS válida.');}
 if(url.protocol!=='https:'||url.username||url.password||url.port||url.search||url.hash||url.pathname!=='/'||url.hostname.replace(/\.$/,'')==='backend-wholesale.sacred-snuff.com')throw new Error('SACRED_RETAIL_SITE_URL deve apontar para a raiz HTTPS da loja de varejo, diferente do atacado.');
 url.hostname=url.hostname.replace(/\.$/,'');
 return {siteUrl:url.origin,key,secret};
}
const runtimeNames:Record<WooStoreId,string>={sacred:"WOO_SACRED",maya:"WOO_MAYA",sc23:"WOO_SC23"};
// Match legacy prefixes by their configured hostname, never by a guessed shop name.
export function canonicalStoreEnvironment(values:EnvironmentValues):Record<string,string>{
 const output:Record<string,string>={};
 for(const store of STORES){
  if(store.id==="pagnier")continue;
  const name=runtimeNames[store.id];
  const canonicalKey=values[name+"_KEY"]?.trim(),canonicalSecret=values[name+"_SECRET"]?.trim();
  if(canonicalKey&&canonicalSecret){
   output[name+"_KEY"]=canonicalKey;output[name+"_SECRET"]=canonicalSecret;continue;
  }
  for(const variable of Object.keys(values).filter(k=>k.endsWith("_SITE_URL"))){
   let url:URL;try{url=new URL(values[variable]!);}catch{continue;}
   if(url.protocol!=="https:"||url.hostname.replace(/\.$/,"")!==store.host||url.username||url.password||url.port)continue;
   const prefix=variable.slice(0,-"_SITE_URL".length);
   const key=values[prefix+"_CONSUMER_KEY"]?.trim(),secret=values[prefix+"_CONSUMER_SECRET"]?.trim();
   if(key&&secret){output[name+"_KEY"]=key;output[name+"_SECRET"]=secret;break;}
  }
 }
 return output;
}
export function environmentConnections(values:EnvironmentValues):EnvironmentConnection[]{
 const canonical=canonicalStoreEnvironment(values);
 let retail:ReturnType<typeof sacredRetailEnvironment>,configurationError:string|undefined;
 try{retail=sacredRetailEnvironment(values);}catch(error){configurationError=(error as Error).message;}
 return STORES.flatMap(store=>{if(store.id==="pagnier")return [];const name=runtimeNames[store.id],key=canonical[name+"_KEY"],secret=canonical[name+"_SECRET"];return key&&secret?[{id:store.id,key,secret,...(store.id==='sacred'?{...(retail?{retail}:{}),...(configurationError?{configurationError}:{})}:{})}]:[];});
}

export type ConnectionSetupIssue={id:WooStoreId;message:string};
export function connectionSetupIssues(values:EnvironmentValues):ConnectionSetupIssue[]{
 const configured=environmentConnections(values);
 return STORES.flatMap(store=>{
  const issue=configured.find(c=>c.id===store.id)?.configurationError;
  if(issue)return [{id:store.id as WooStoreId,message:issue}];
  if(store.id==='pagnier'||configured.some(c=>c.id===store.id))return [];
  const prefix=runtimeNames[store.id];
  // Sacred and Maya are expected sources. Show optional SC23 only if started.
  if(store.id==='sc23'&&!values[prefix+'_KEY']&&!values[prefix+'_SECRET'])return [];
  const missing=['_KEY','_SECRET'].filter(suffix=>!values[prefix+suffix]?.trim()).map(suffix=>prefix+suffix);
  return [{id:store.id,message:'O deploy atual não recebeu valor preenchido em '+missing.join(' e ')+'. Preencha essas variáveis em Production e publique novamente. Se usa um prefixo como BRINCR, confira também a URL HTTPS e o par CONSUMER_KEY/CONSUMER_SECRET desse prefixo.'}];
 });
}
