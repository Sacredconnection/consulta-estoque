import ExcelJS from 'exceljs';
import type {ReplenishmentReport} from './replenishment';

// Exact column names/order from Importação+de+pedidos+de+venda (2).xlsx.
export const NOMUS_HEADERS=['Pedido',' Cliente',' Empresa',' Data de emissão',' observações','item',' Código do produto',' Descrição do produto',' Tipo de produto',' Método de ressuprimento',' U.M.',' Qtde','  Preço unitário ',' Data de entrega','Hora de entrega','Condição de pagamento','Tabela de preço','Setor de saída','Forma de pagamento','Tipo de movimentação','Tipo de desconto','Valor de desconto',' Pedido compra do cliente',' Item do Pedido compra do cliente','Data de entregado padrão do pedido','Tipo de pedido'];
export type NomusOrder={order:string;customer:string;company:string;issued:string;delivery?:string;sector?:string;movement?:string};
function date(value:string){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value)throw Error('Data inválida para o pedido Nomus.');
 return value.split('-').reverse().join('/');
}
export async function buildNomusWorkbook(report:ReplenishmentReport,details:NomusOrder){
 if(!details.order.trim()||!details.customer.trim()||!details.company.trim())throw Error('Preencha pedido, cliente e empresa do Nomus.');
 const issued=date(details.issued),delivery=details.delivery?date(details.delivery):null;
 const lines=report.lines.filter(r=>r.status==='order');
 if(!lines.length)throw Error('Não há itens calculáveis para exportar.');
 if(lines.some(r=>!r.sku.trim()||r.order===null||!Number.isFinite(r.order)||r.order<=0))throw Error('Há itens com SKU ou quantidade inválidos.');
 if(report.storeId==='pagnier'&&lines.some(r=>r.unit!=='kg'&&r.unit!=='L'))throw Error('Confira as unidades dos itens Pagnier.');
 const workbook=new ExcelJS.Workbook();
 const instructions=workbook.addWorksheet('Comece por aqui');
 instructions.addRows([
  ['Importação de pedidos de venda — Nomus'],
  ['Modelo: Importação+de+pedidos+de+venda (2).xlsx'],
  ['Revise antes de importar: preço unitário e demais campos comerciais não disponíveis ficaram em branco.'],
  ['Cliente, empresa, códigos dos produtos e unidades devem corresponder aos cadastros do seu Nomus. Nenhuma equivalência de SKU foi presumida.'],
  ['Apenas itens a repor foram exportados, respeitando os filtros. Itens para revisão e mínimos atendidos não entram.'],
  [report.storeId==='pagnier'?'Pagnier: quantidades em KG/LITRO, sem arredondamento adicional.':'Quantidades em UNID, conforme o pedido de reposição calculado.'],
  ['Fonte dos mínimos',report.source],
  ['Empresa consultada',report.storeName??report.storeId??''],
 ]);
 instructions.getColumn(1).width=110;
 const sheet=workbook.addWorksheet('Pedidos de Vendas');
 sheet.addRow(NOMUS_HEADERS);
 lines.forEach((line,i)=>{
  const row:Array<string|number|null>=Array(26).fill(null);
  row[0]=details.order.trim();row[1]=details.customer.trim();row[2]=details.company.trim();row[3]=issued;
  row[5]=i+1;row[6]=line.sku;row[7]=line.product;
  row[10]=report.storeId==='pagnier'?(line.unit==='kg'?'KG':'LITRO'):'UNID';
  row[11]=line.order;row[13]=delivery;row[17]=details.sector?.trim()||null;row[19]=details.movement?.trim()||null;
  sheet.addRow(row);
 });
 sheet.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};
 sheet.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF1E429B'}};
 sheet.getRow(1).alignment={wrapText:true};
 sheet.columns.forEach((col,i)=>{col.width=i===7?55:24;});
 sheet.getColumn(7).numFmt='@';sheet.getColumn(12).numFmt='0.#########';
 sheet.views=[{state:'frozen',ySplit:1}];
 return workbook;
}
