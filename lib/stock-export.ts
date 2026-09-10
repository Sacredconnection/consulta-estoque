import ExcelJS from 'exceljs';
import {STORES,type StoreId} from './inventory';
import {totalMass,type StockRow} from './stock-table';

export async function stockWorkbook(rows:StockRow[],storeIds:StoreId[],context:string){
 const workbook=new ExcelJS.Workbook();workbook.creator='MS Lumiar';workbook.created=new Date();
 const sheet=workbook.addWorksheet('Estoque');
 const headers=['SKU','Produto','Apresentação',...storeIds.flatMap(id=>{const label=STORES.find(s=>s.id===id)!.short;return [label+' · quantidade',label+' · unidade',label+' · kg',label+' · SKUs',label+' · observações'];}),'Total kg','Observações do total'];
 sheet.addRow(['Consulta de estoque · MS Lumiar']);sheet.addRow([context]);
 sheet.addRow(['Exportado em '+new Date().toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})+' (Brasília)']);
 sheet.addRow(['Dados da última sincronização. N/D = não informado; — = sem registro. Totais parciais excluem saldos/pesos desconhecidos e compartilhados.']);
 sheet.addRow(headers);
 for(const row of rows){
  const cells=storeIds.flatMap(id=>{
   const cell=row.stores[id];if(!cell)return ['—','—','—','—','Sem registro'];
   return [cell.quantity??'N/D',cell.unit,cell.kg??'N/D',cell.skus.join(' / '),[cell.shared?'Saldo compartilhado':'',cell.partialQuantity?'Quantidade parcial':'',cell.partial?'Kg parcial':''].filter(Boolean).join('; ')];
  });
  const total=totalMass(storeIds.flatMap(id=>row.stores[id]?[row.stores[id]!]:[]));
  const primary=[...new Set(storeIds.flatMap(id=>row.stores[id]?.names??[]))].sort((a,b)=>a.length-b.length||a.localeCompare(b,'pt-BR'))[0]??row.product;
  sheet.addRow([row.sku,primary,row.presentation,...cells,total.kg??'N/D',total.partial?'Total parcial':'']);
 }
 const totals=storeIds.map(id=>totalMass(rows.flatMap(row=>row.stores[id]?[row.stores[id]!]:[])));
 const grand=totalMass(totals.filter(t=>t.kg!==null||t.partial));
 sheet.addRow(['TOTAL KG','','',...totals.flatMap(t=>['','',t.kg??'N/D','',t.partial?'Total parcial':'']),grand.kg??'N/D',grand.partial?'Total parcial':'']);
 sheet.addRow(['DOS QUAIS, GRANEL (KG)','','',...totals.flatMap(t=>['','',t.bulkKg??'—','',t.partial?'Total parcial':'']),grand.bulkKg??'—',grand.partial?'Total parcial':'']);
 sheet.views=[{state:'frozen',ySplit:5,xSplit:2}];
 sheet.autoFilter={from:{row:5,column:1},to:{row:5+rows.length,column:headers.length}};
 sheet.columns.forEach((col,i)=>{col.width=i===1?55:i===0?20:i===2?24:22;});
 for(let i=1;i<=4;i++){sheet.mergeCells(i,1,i,headers.length);sheet.getRow(i).height=i===4?34:24;sheet.getRow(i).alignment={wrapText:true,vertical:'middle'};}
 sheet.getRow(1).font={bold:true,size:16,color:{argb:'FF537A20'}};
 sheet.getRow(5).font={bold:true};sheet.getRow(5).height=35;sheet.getRow(5).alignment={wrapText:true,vertical:'middle'};
 sheet.eachRow((row,index)=>{if(index<5)return;row.eachCell({includeEmpty:true},(cell,column)=>{
  cell.alignment={vertical:'middle',wrapText:true};
  if(typeof cell.value==='number')cell.numFmt='#,##0.00####';
  if(index===5||index>5+rows.length){cell.font={bold:true};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFEDF1E2'}};}
  if(column>=4&&column<4+storeIds.length*5&&index===5){const store=STORES.find(s=>s.id===storeIds[Math.floor((column-4)/5)])!;cell.font={bold:true,color:{argb:'FFFFFFFF'}};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF'+store.color.slice(1)}};}
 });});
 return workbook.xlsx.writeBuffer();
}

export async function exportStockExcel(rows:StockRow[],storeIds:StoreId[],context:string){
 const data=await stockWorkbook(rows,storeIds,context);
 const url=URL.createObjectURL(new Blob([new Uint8Array(data)],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
 const link=document.createElement('a');link.href=url;link.download='estoque-'+storeIds.join('-')+'-'+new Date().toISOString().slice(0,10)+'.xlsx';
 document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
