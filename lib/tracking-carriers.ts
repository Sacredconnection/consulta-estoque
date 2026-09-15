export type TrackingResult={status:string;description:string;expectedDelivery:string|null;checkedAt:string};
export function carrierReady(carrier:string){
 if(carrier==='DHL')return !!process.env.DHL_TRACKING_API_KEY;
 if(carrier==='FedEx')return !!process.env.FEDEX_CLIENT_ID&&!!process.env.FEDEX_CLIENT_SECRET;
 if(carrier==='UPS')return !!process.env.UPS_CLIENT_ID&&!!process.env.UPS_CLIENT_SECRET;
 return false;
}
export function trackingLink(carrier:string,tracking:string){
 const code=encodeURIComponent(tracking);
 if(carrier==='DHL')return `https://www.dhl.com/br-pt/home/rastreamento.html?tracking-id=${code}`;
 if(carrier==='FedEx')return `https://www.fedex.com/fedextrack/?trknbr=${code}`;
 if(carrier==='UPS')return `https://www.ups.com/track?tracknum=${code}`;
 if(carrier==='USPS')return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${code}`;
 return null;
}
export function statusLabel(code:string){
 const c=code.toLowerCase();
 if(['delivered','dl','d'].includes(c))return 'Entregue';
 if(['transit','it','i'].includes(c))return 'Em trânsito';
 if(['out-for-delivery','od','o'].includes(c))return 'Saiu para entrega';
 if(['failure','exception','de','se','e'].includes(c))return 'Exceção';
 if(['pre-transit','oc','m'].includes(c))return 'Aguardando coleta';
 return 'Em acompanhamento';
}
// Only fixed official API hosts are called. Spreadsheet links never become fetch URLs.
async function request(url:string,init:RequestInit={}){
 const response=await fetch(url,{...init,signal:AbortSignal.timeout(20000),cache:'no-store',redirect:'error'});
 if(!response.ok)throw Error(response.status===429?'Limite de consultas da transportadora atingido.':`Transportadora retornou HTTP ${response.status}.`);
 return response.json();
}
const tokens=new Map<string,{value:string;until:number}>();
async function token(carrier:'FedEx'|'UPS'){
 const cached=tokens.get(carrier);if(cached&&cached.until>Date.now())return cached.value;
 const fedex=carrier==='FedEx',id=process.env[fedex?'FEDEX_CLIENT_ID':'UPS_CLIENT_ID']!,secret=process.env[fedex?'FEDEX_CLIENT_SECRET':'UPS_CLIENT_SECRET']!;
 const data=await request(fedex?'https://apis.fedex.com/oauth/token':'https://onlinetools.ups.com/security/v1/oauth/token',{
  method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',...(!fedex?{Authorization:`Basic ${Buffer.from(id+':'+secret).toString('base64')}`}:{})},
  body:new URLSearchParams({grant_type:'client_credentials',...(fedex?{client_id:id,client_secret:secret}:{})}).toString()
 });
 if(typeof data.access_token!=='string')throw Error('Autenticação da transportadora não retornou um token.');
 tokens.set(carrier,{value:data.access_token,until:Date.now()+Math.max(0,Number(data.expires_in||300)-60)*1000});return data.access_token as string;
}
export async function track(carrier:string,tracking:string):Promise<TrackingResult>{
 if(!carrierReady(carrier))throw Error(`Integração ${carrier} pendente de credenciais.`);
 let code='',description='',expectedDelivery:string|null=null;
 if(carrier==='DHL'){
  const data=await request(`https://api-eu.dhl.com/track/shipments?trackingNumber=${encodeURIComponent(tracking)}`,{headers:{'DHL-API-Key':process.env.DHL_TRACKING_API_KEY!}});
  const shipment=data.shipments?.find((s:{id?:string})=>s.id===tracking);
  if(!shipment?.status)throw Error('DHL não encontrou informações para este tracking.');
  code=shipment.status.statusCode;description=shipment.status.description||shipment.status.status;expectedDelivery=shipment.estimatedTimeOfDelivery??null;
 }else if(carrier==='FedEx'){
  const data=await request('https://apis.fedex.com/track/v1/trackingnumbers',{method:'POST',headers:{Authorization:`Bearer ${await token('FedEx')}`,'Content-Type':'application/json'},body:JSON.stringify({includeDetailedScans:false,trackingInfo:[{trackingNumberInfo:{trackingNumber:tracking}}]})});
  const result=data.output?.completeTrackResults?.[0]?.trackResults?.find((r:{trackingNumberInfo?:{trackingNumber?:string}})=>r.trackingNumberInfo?.trackingNumber===tracking);
  if(!result?.latestStatusDetail||result.error)throw Error('FedEx não encontrou informações para este tracking.');
  code=result.latestStatusDetail.code;description=result.latestStatusDetail.description;expectedDelivery=result.dateAndTimes?.find((d:{type:string})=>d.type==='ESTIMATED_DELIVERY')?.dateTime??null;
 }else{
  const data=await request(`https://onlinetools.ups.com/api/track/v1/details/${encodeURIComponent(tracking)}?locale=pt_BR&returnSignature=false`,{headers:{Authorization:`Bearer ${await token('UPS')}`,transId:crypto.randomUUID(),transactionSrc:'consulta-estoque'}});
  const result=data.trackResponse?.shipment?.flatMap((s:{package?:unknown[]})=>s.package??[]).find((p:{trackingNumber:string})=>p.trackingNumber===tracking);
  const status=result?.currentStatus??result?.activity?.[0]?.status;
  if(!status)throw Error('UPS não encontrou informações para este tracking.');
  code=status.type??status.code;description=status.description;
  const date=result.deliveryDate?.find((d:{type:string})=>d.type==='SDD')?.date;
  if(typeof date==='string'&&/^\d{8}$/.test(date))expectedDelivery=`${date.slice(0,4)}-${date.slice(4,6)}-${date.slice(6,8)}`;
 }
 if(typeof code!=='string'||typeof description!=='string')throw Error('Resposta de rastreio incompleta.');
 return {status:statusLabel(code),description,expectedDelivery,checkedAt:new Date().toISOString()};
}
