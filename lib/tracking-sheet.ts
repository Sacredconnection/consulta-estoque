import ExcelJS from 'exceljs';
import { createHash } from 'node:crypto';

export type Shipment = { id:string; sheet:string; row:number; order:string; customer:string; carrier:string; tracking:string; collected:string|null; orderStatus:string; historical:boolean; issue:string|null };
export const normalize = (s:string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
export function cellText(value:ExcelJS.CellValue):string {
 if(value===null||value===undefined)return '';
 if(value instanceof Date)return value.toISOString().slice(0,10);
 if(typeof value==='object'){
  if('richText' in value)return value.richText.map(t=>t.text).join('');
  if('text' in value)return value.text;
  if('result' in value)return cellText(value.result as ExcelJS.CellValue);
  return '';
 }
 return String(value).trim();
}
export function codes(raw:string):{carrier:string;tracking:string}[] {
 const carrier=/fed\s*ex/i.test(raw)?'FedEx':/dhl/i.test(raw)?'DHL':/\bups\b/i.test(raw)?'UPS':/usps/i.test(raw)?'USPS':'';
 const matches=raw.toUpperCase().match(/\b1Z[A-Z0-9]{16}\b|\bJVGL\d{10,}\b|\b\d{10,22}\b|\b[A-Z]{2}\d{9}[A-Z]{2}\b/g)??[];
 return [...new Set(matches)].map(tracking=>({carrier:tracking.startsWith('1Z')?'UPS':carrier||'Não identificada',tracking}));
}
export async function parseTrackingSheet(bytes:Buffer,now=Date.now()):Promise<Shipment[]> {
 const workbook=new ExcelJS.Workbook();
 await workbook.xlsx.load(bytes as never);
 const shipments:Shipment[]=[];
 for(const sheet of workbook.worksheets){
  let header=0,columns:string[]=[];
  for(let n=1;n<=Math.min(10,sheet.rowCount);n++){
   const values=Array.from({length:sheet.columnCount},(_,i)=>normalize(cellText(sheet.getRow(n).getCell(i+1).value)));
   if(values.some(v=>v.includes('awb'))&&values.some(v=>v.includes('cliente'))){header=n;columns=values;break;}
  }
  if(!header)continue;
  const index=(pattern:RegExp)=>columns.findIndex(v=>pattern.test(v))+1;
  const orderCol=index(/ped/),customerCol=index(/cliente/),awbCol=index(/trasportadora|transportadora/),dateCol=index(/data da coleta/),statusCol=index(/^status$/);
  if(!orderCol||!customerCol||!awbCol)continue;
  for(let n=header+1;n<=sheet.rowCount;n++){
   const row=sheet.getRow(n),get=(c:number)=>c?cellText(row.getCell(c).value).trim():'';
   const order=get(orderCol),customer=get(customerCol);if(!order||!customer)continue;
   const collected=get(dateCol)||null,orderStatus=get(statusCol);
   const historical=!collected||!/^\d{4}-\d{2}-\d{2}$/.test(collected)||Date.parse(collected)<now-120*86400000||/cancelad/.test(normalize(orderStatus));
   const legs=[{raw:get(awbCol),leg:'original'}];
   const forward=index(/awb redirecionamento/);if(forward&&get(forward))legs.push({raw:get(forward),leg:'redirecionamento'});
   for(const leg of legs){
    const parsed=codes(leg.raw);
    for(const entry of parsed.length?parsed:[{carrier:'Não identificada',tracking:''}]){
     const key=[sheet.name,order,customer,leg.leg,entry.carrier,entry.tracking].join('|');
     const id=createHash('sha256').update(key).digest('hex').slice(0,32);
     if(shipments.some(s=>s.id===id))continue;
     shipments.push({id,sheet:sheet.name,row:n,order,customer,...entry,collected,orderStatus,historical,issue:!entry.tracking?'Tracking ausente ou formato não reconhecido':entry.carrier==='Não identificada'?'Transportadora não identificada':null});
    }
   }
  }
 }
 if(!shipments.length)throw Error('Nenhuma aba com pedido, cliente e transportadora/AWB foi reconhecida.');
 return shipments;
}
