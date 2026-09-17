import ExcelJS from 'exceljs';
import type {ReplenishmentReport} from './replenishment';

// Exact column names/order from Importação+de+pedidos+de+venda (2).xlsx.
export const NOMUS_HEADERS=['Pedido',' Cliente',' Empresa',' Data de emissão',' observações','item',' Código do produto',' Descrição do produto',' Tipo de produto',' Método de ressuprimento',' U.M.',' Qtde','  Preço unitário ',' Data de entrega','Hora de entrega','Condição de pagamento','Tabela de preço','Setor de saída','Forma de pagamento','Tipo de movimentação','Tipo de desconto','Valor de desconto',' Pedido compra do cliente',' Item do Pedido compra do cliente','Data de entregado padrão do pedido','Tipo de pedido'];
export type NomusOrder={order:string;customer:string};
export const NOMUS_COMPANY='PAGNIER COMERCIO LTDA';
export function nomusDates(now=new Date()){
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Sao_Paulo',year:'numeric',month:'numeric',day:'numeric'}).formatToParts(now);
 const part=(name:string)=>Number(parts.find(p=>p.type===name)!.value);
 const year=part('year'),month=part('month')-1,day=part('day');
 const issued=new Date(Date.UTC(year,month,day));
 const lastDay=new Date(Date.UTC(year,month+2,0)).getUTCDate();
 return {issued,delivery:new Date(Date.UTC(year,month+1,Math.min(day,lastDay)))};
}
export async function buildNomusWorkbook(report:ReplenishmentReport,details:NomusOrder,now=new Date()){
 if(!details.order.trim()||!details.customer.trim())throw Error('Preencha pedido e cliente do Nomus.');
 const {issued,delivery}=nomusDates(now);
 const lines=report.lines.filter(r=>r.status==='order');
 if(!lines.length)throw Error('Não há itens calculáveis para exportar.');
 if(lines.some(r=>!r.sku.trim()||r.order===null||!Number.isFinite(r.order)||r.order<=0))throw Error('Há itens com SKU ou quantidade inválidos.');
 if(report.storeId==='pagnier'&&lines.some(r=>r.unit!=='kg'&&r.unit!=='L'))throw Error('Confira as unidades dos itens Pagnier.');
 const workbook=new ExcelJS.Workbook();
 const instructions=workbook.addWorksheet('Comece por aqui');
 instructions.addRows([
  ['Importação de pedidos de venda — Nomus'],
  ['Modelo: Importação+de+pedidos+de+venda (3) (1) (2).xlsx'],
  ['Padrões do modelo: PAGNIER COMERCIO LTDA, preço unitário 10 e UNIDADE. Demais campos comerciais permanecem vazios.'],
  ['Emissão: data da exportação em Brasília. Entrega: um mês calendário depois, limitada ao último dia do mês de destino.'],
  ['Cliente, empresa, códigos dos produtos e unidades devem corresponder aos cadastros do seu Nomus. Nenhuma equivalência de SKU foi presumida.'],
  ['Apenas itens a repor foram exportados, respeitando os filtros. Itens para revisão e mínimos atendidos não entram.'],
  [report.storeId==='pagnier'?'Pagnier: preservadas as medidas KG/LITRO, sem arredondamento adicional.':'Quantidades em UNIDADE, conforme o pedido de reposição calculado.'],
  ['Fonte dos mínimos',report.source],
  ['Empresa consultada',report.storeName??report.storeId??''],
 ]);
 instructions.getColumn(1).width=110;
 const sheet=workbook.addWorksheet('Pedidos de Vendas');
 sheet.addRow(NOMUS_HEADERS);
 lines.forEach((line,i)=>{
  const row:Array<string|number|Date|null>=Array(26).fill(null);
  row[0]=details.order.trim();row[1]=details.customer.trim();row[2]=NOMUS_COMPANY;row[3]=issued;
  row[5]=i+1;row[6]=line.sku;row[7]=line.product;
  row[10]=report.storeId==='pagnier'?(line.unit==='kg'?'KG':'LITRO'):'UNIDADE';
  row[11]=line.order;row[12]=10;row[13]=delivery;
  sheet.addRow(row);
 });
 sheet.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};
 sheet.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF1E429B'}};
 sheet.getRow(1).alignment={wrapText:true};
 sheet.columns.forEach((col,i)=>{col.width=i===7?55:24;});
 sheet.getColumn(7).numFmt='@';sheet.getColumn(12).numFmt='0.#########';
 sheet.getColumn(4).numFmt='dd/mm/yyyy';sheet.getColumn(14).numFmt='dd/mm/yyyy';
 sheet.views=[{state:'frozen',ySplit:1}];
 return workbook;
}
