import type {Product} from './inventory';
export type SaleLine={sku:string;product:string;quantity:number};
export type SalesOrder={id:string;number?:string;date:string;status:string;reference?:string;lines:SaleLine[]};
export function buildSalesMinimums(retail:SalesOrder[],sheet:SalesOrder[],catalog:Product[],months:number){
 if(!Number.isFinite(months)||months<=0)throw Error('Período inválido');
 const audit={retailOrders:retail.length,retailIncluded:0,sheetIncluded:0,sheetMirrors:0,sheetUnverifiedMirrors:0,excludedOrders:0,shippingLines:0,emptySkus:0};
 const sold=new Map<string,{retail:number;sheet:number;product:string}>();
 const retailIds=new Set(retail.flatMap(o=>[o.id,o.number??o.id]));
 const shipping=(l:SaleLine)=>/^SHIP-/i.test(l.sku)||/^(shipping charges|verzendkosten)\b/i.test(l.product);
 const add=(o:SalesOrder,channel:'retail'|'sheet')=>{
  for(const l of o.lines){
   if(!Number.isFinite(l.quantity)||l.quantity<0)throw Error('Quantidade de venda inválida');
   if(shipping(l)){audit.shippingLines++;continue;}
   const sku=l.sku.trim().toUpperCase();if(!sku){audit.emptySkus++;continue;}
   const value=sold.get(sku)??{retail:0,sheet:0,product:l.product};value[channel]+=l.quantity;sold.set(sku,value);
  }
 };
 const seen=new Set<string>();
 for(const o of retail){
  if(seen.has(o.id))throw Error('Pedido varejo duplicado');seen.add(o.id);
  if(!['completed','processing'].includes(o.status)){audit.excludedOrders++;continue;}
  add(o,'retail');audit.retailIncluded++;
 }
 seen.clear();
 for(const o of sheet){
  if(seen.has(o.id))throw Error('Pedido planilha duplicado');seen.add(o.id);
  const ref=/(?:Webshop order|Weborder)\s*#(\d+)/i.exec(o.reference??'');
  if(ref||o.status==='WooCommerce'){
   if(ref&&retailIds.has(ref[1]))audit.sheetMirrors++;else audit.sheetUnverifiedMirrors++;
   continue; // Channel-import markers are not evidence of payment.
  }
  if(!['Afgerond / Factureren','Gereed voor Picken'].includes(o.status)){audit.excludedOrders++;continue;}
  add(o,'sheet');audit.sheetIncluded++;
 }
 const index=new Map<string,Product>();
 for(const p of catalog){if(p.stocks.some(s=>s.storeId==='maya'))index.set(p.sku.trim().toUpperCase(),p);}
 const items=[],unmatched=[];
 for(const [sku,units] of sold){
  const total=units.retail+units.sheet;if(total<=0)continue;
  const product=index.get(sku);
  if(!product){unmatched.push({sku,...units});continue;}
  const stock=product.stocks.find(s=>s.storeId==='maya')!;
  items.push({sku,product:stock.productName??product.name,variation:stock.variationName??'',minimum:Math.ceil(total/months*3),sold:total,soldRetail:units.retail,soldSheet:units.sheet,monthlyAverage:total/months});
 }
 items.sort((a,b)=>a.sku.localeCompare(b.sku));
 return {items,unmatched,audit};
}
