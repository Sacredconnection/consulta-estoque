type SheetStatus={orderStatus:string;deliveredInSheet?:boolean};
export function deliveredStatus(value:string):boolean {
 const status=value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
 if(/\b(nao|not|never|ainda|aguardando|pendente)\b/.test(status))return false;
 return /^(?:(?:pedido|pacote|encomenda|objeto|envio)\s+(?:foi\s+)?)?(?:entregues?|delivered)\b/.test(status);
}
export function deliveredInSheet(row:SheetStatus):boolean {
 return row.deliveredInSheet===true||deliveredStatus(row.orderStatus);
}
