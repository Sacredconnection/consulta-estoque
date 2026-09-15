import type {TrackingResult} from './tracking-carriers';

export type Track17Input={carrier:string;tracking:string;collected?:string|null};
export type Track17Outcome={result:TrackingResult|null;error:string|null};
export const trackingKey=(row:Track17Input)=>`${row.carrier}:${row.tracking}`;
export const track17Configured=()=>!!process.env.TRACK17_API_KEY?.trim();

// Verified against https://res.17track.net/asset/carrier/info/apicarrier.all.json.
export function track17Carrier(row:Track17Input):number|null {
 if(row.carrier==='DHL')return row.tracking.startsWith('JVGL')?100047:100001;
 return ({FedEx:100003,UPS:100002,USPS:21051} as Record<string,number>)[row.carrier]??null;
}
const labels:Record<string,string>={
 NotFound:'Não encontrado',InfoReceived:'Aguardando coleta',InTransit:'Em trânsito',
 Expired:'Rastreio expirado',AvailableForPickup:'Disponível para retirada',
 OutForDelivery:'Saiu para entrega',DeliveryFailure:'Falha na entrega',Delivered:'Entregue',Exception:'Exceção',
};
type Item={number?:string;carrier?:number;error?:{code?:number};track_info?:unknown};
type Envelope={code?:number;data?:{accepted?:Item[];rejected?:Item[];errors?:{code?:number}[]}};
const pending='Cadastrado na 17TRACK; aguardando retorno da transportadora. Consulte novamente em alguns minutos.';
function apiError(code?:number){
 const messages:Record<number,string>={
  [-18010001]:'O IP do servidor não está autorizado na 17TRACK.',
  [-18010002]:'A chave da 17TRACK é inválida. Confira TRACK17_API_KEY na Vercel.',
  [-18010004]:'A conta 17TRACK está desativada.',
  [-18010005]:'A conta não tem autorização para esta operação na 17TRACK.',
  [-18019903]:'A 17TRACK não identificou a transportadora. Revise o cadastro.',
  [-18019907]:'Limite diário da 17TRACK atingido.',
  [-18019908]:'Os créditos da 17TRACK acabaram. Confira o saldo da conta.',
  [-18019909]:pending,
  [-18019911]:'A 17TRACK não permite cadastrar esta transportadora no momento. Confira a habilitação na conta.',
  [-18010204]:'A 17TRACK solicita a configuração de um webhook na conta.',
  [-18010022]:'A transportadora precisa da data de envio para consultar este pacote.',
 };
 if(code&&[-18010018,-18010019,-18010020].includes(code))return 'A transportadora precisa de dados adicionais do destinatário. Revise o cadastro.';
 return messages[code??0]??`A 17TRACK recusou a consulta${typeof code==='number'?` (código ${code})`:''}.`;
}
function object(value:unknown):Record<string,unknown>|null{return value!==null&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:null;}
function text(value:unknown):string|null{return typeof value==='string'&&value.trim()?value.trim():null;}
function date(value:unknown):string|null{const s=text(value);return s&&/^\d{4}-\d{2}-\d{2}(?:T|$)/.test(s)&&Number.isFinite(Date.parse(s))?s:null;}

export function parseTrack17Result(value:unknown):TrackingResult|null {
 const info=object(value),status=object(info?.latest_status),rawStatus=text(status?.status);
 if(!rawStatus||!labels[rawStatus])return null;
 const event=object(info?.latest_event),translation=object(event?.description_translation);
 const estimate=object(object(info?.time_metrics)?.estimated_delivery_date);
 const providers=object(info?.tracking)?.providers;
 const syncTimes=Array.isArray(providers)?providers.map(p=>date(object(p)?.latest_sync_time)).filter((v):v is string=>!!v):[];
 syncTimes.sort((a,b)=>Date.parse(b)-Date.parse(a));
 return {
  status:labels[rawStatus],
  description:(translation?.lang==='pt'?text(translation.description):null)??text(event?.description)??text(status?.sub_status_descr)??labels[rawStatus],
  expectedDelivery:date(estimate?.to)??date(estimate?.from),
  expectedDeliveryFrom:date(estimate?.from),expectedDeliverySource:text(estimate?.source),
  checkedAt:new Date().toISOString(),source:'17TRACK',
  eventAt:date(event?.time_utc)??date(event?.time_iso),carrierSyncedAt:syncTimes[0]??null,location:text(event?.location),
 };
}

async function call(endpoint:'gettrackinfo'|'register',items:object[]):Promise<Required<Pick<NonNullable<Envelope['data']>,'accepted'|'rejected'>>> {
 if(!track17Configured())throw Error('Configure TRACK17_API_KEY na Vercel.');
 let response:Response;
 try{response=await fetch(`https://api.17track.net/track/v2.4/${endpoint}`,{
  method:'POST',headers:{'Content-Type':'application/json','17token':process.env.TRACK17_API_KEY!.trim()},
  body:JSON.stringify(items),cache:'no-store',redirect:'error',signal:AbortSignal.timeout(20000),
 });}catch{throw Error('Não foi possível acessar a 17TRACK. Tente novamente.');}
 if(!response.ok)throw Error(response.status===401?'A 17TRACK recusou a chave ou o IP do servidor.':response.status===429?'Limite de requisições da 17TRACK atingido. Tente novamente mais tarde.':`17TRACK indisponível (HTTP ${response.status}).`);
 const envelope=await response.json().catch(()=>null) as Envelope|null;
 if(envelope?.code!==0||envelope.data?.errors?.length)throw Error(apiError(envelope?.data?.errors?.[0]?.code??envelope?.code));
 if(!Array.isArray(envelope.data?.accepted)||!Array.isArray(envelope.data?.rejected))throw Error('Resposta incompleta da 17TRACK.');
 return {accepted:envelope.data.accepted,rejected:envelope.data.rejected};
}

// One subscription per number/carrier. Query existing subscriptions first; only
// -18019902 triggers registration. No delete/re-register or paid instant fetch.
export async function track17Batch(input:Track17Input[]):Promise<Map<string,Track17Outcome>> {
 const unique=[...new Map(input.map(row=>[trackingKey(row),row])).values()];
 if(unique.length>40)throw Error('O lote da 17TRACK deve ter até 40 códigos.');
 const outcomes=new Map<string,Track17Outcome>();
 const rows=unique.filter(row=>{
  if(track17Carrier(row))return true;
  outcomes.set(trackingKey(row),{result:null,error:'Transportadora não mapeada para a 17TRACK.'});return false;
 });
 if(!rows.length)return outcomes;
 const payload=(row:Track17Input)=>({number:row.tracking,carrier:track17Carrier(row)!});
 const matches=(item:Item,row:Track17Input)=>item.number===row.tracking&&item.carrier===track17Carrier(row);
 const rejectedMatch=(item:Item,row:Track17Input)=>matches(item,row)||(item.number===row.tracking&&(!item.carrier)&&rows.filter(r=>r.tracking===row.tracking).length===1);
 try{
  const queried=await call('gettrackinfo',rows.map(payload)),missing:Track17Input[]=[];
  for(const row of rows){
   const accepted=queried.accepted.find(item=>matches(item,row));
   const rejected=queried.rejected.find(item=>rejectedMatch(item,row));
   if(accepted){
    const result=parseTrack17Result(accepted.track_info);
    outcomes.set(trackingKey(row),{result,error:result?null:pending});
   }else if(rejected?.error?.code===-18019902){missing.push(row);}
   else outcomes.set(trackingKey(row),{result:null,error:rejected?apiError(rejected.error?.code):'A 17TRACK não retornou este código para a transportadora informada.'});
  }
  if(missing.length){
   const registered=await call('register',missing.map(row=>({...payload(row),lang:'pt',translation_mode:'UseDefaultLang',
    ...(row.collected&&/^\d{4}-\d{2}-\d{2}$/.test(row.collected)?{ship_date:row.collected.replaceAll('-','/')}:{})})));
   for(const row of missing){
    const accepted=registered.accepted.find(item=>matches(item,row)),rejected=registered.rejected.find(item=>rejectedMatch(item,row));
    outcomes.set(trackingKey(row),{result:null,error:accepted||rejected?.error?.code===-18019901?pending:rejected?apiError(rejected.error?.code):'A 17TRACK retornou outra transportadora ou uma resposta incompleta. Revise este tracking.'});
   }
  }
 }catch(error){
  for(const row of rows)if(!outcomes.has(trackingKey(row)))outcomes.set(trackingKey(row),{result:null,error:error instanceof Error?error.message:'Falha na 17TRACK.'});
 }
 return outcomes;
}
