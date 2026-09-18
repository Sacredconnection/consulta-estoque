import ExcelJS from 'exceljs';
import {STORES,type StoreId} from './inventory';
import {BULK_SIZES,bulkTotal,type BulkAmount,type BulkGroup} from './bulk-summary';

export async function bulkWorkbook(groups:BulkGroup[],storeIds:StoreId[],query=''){
 const workbook=new ExcelJS.Workbook();workbook.creator='MS Lumiar';workbook.created=new Date();
 const sheet=workbook.addWorksheet('Granel simplificado');
 sheet.addRow(['Produto / pote',...storeIds.map(id=>STORES.find(store=>store.id===id)!.short)]);
 function add(label:string,values:(BulkAmount|undefined)[],mass=false,emphasis=false){
  const row=sheet.addRow([label,...values.map(value=>!value?'—':(mass?value.kg:value.quantity)??(value.partial?'N/D':'—'))]);
  row.height=emphasis?30:23;
  row.eachCell((cell,column)=>{
   cell.alignment={vertical:'middle',horizontal:column===1?'left':'right',wrapText:column===1};
   if(column>1){cell.numFmt='#,##0.###'+(values[column-2]?.partial?'" *"':'');if(values[column-2]?.partial)cell.note='Total parcial: saldo não informado excluído da soma.';}
   if(emphasis){cell.font={bold:true,color:{argb:'FF507C08'}};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFEEF2E4'}};}
  });
 }
 add('Total granel (kg)',storeIds.map(id=>bulkTotal(groups,id)),true,true);
 for(const group of groups){
  add(group.name+(group.code?' · '+group.code:'')+' · Total kg',storeIds.map(id=>bulkTotal([group],id)),true,true);
  if(group.loose.pagnier&&storeIds.includes('pagnier'))add('    Granel (kg)',storeIds.map(id=>group.loose[id]),true);
  for(const size of BULK_SIZES)add('    '+size+' g',storeIds.map(id=>group.sizes[size]?.[id]));
 }
 sheet.addRow([]);
 const notes=['Rapé · granel Pagnier em kg e potes de 100, 250 e 500 g em unidades. Totais em kg incluem ambos.','N/D = não informado; — = sem registro; * = soma parcial.',...(query?['Busca: '+query]:[]),'Exportado em '+new Date().toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})+' (Brasília)'];
 for(const note of notes){const row=sheet.addRow([note]);if(storeIds.length)sheet.mergeCells(row.number,1,row.number,storeIds.length+1);row.alignment={wrapText:true,vertical:'middle'};row.height=30;row.font={size:10,color:{argb:'FF6E735F'}};}
 sheet.getColumn(1).width=55;storeIds.forEach((_,i)=>{sheet.getColumn(i+2).width=18;});
 sheet.getRow(1).font={bold:true,color:{argb:'FF507C08'}};sheet.getRow(1).height=28;
 sheet.views=[{state:'frozen',ySplit:2,xSplit:1}];
 sheet.pageSetup={orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0};
 return workbook.xlsx.writeBuffer();
}
export async function exportBulkExcel(groups:BulkGroup[],storeIds:StoreId[],query=''){
 const data=await bulkWorkbook(groups,storeIds,query);
 const url=URL.createObjectURL(new Blob([new Uint8Array(data)],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
 const link=document.createElement('a');link.href=url;link.download='granel-rape-'+storeIds.join('-')+'-'+new Date().toISOString().slice(0,10)+'.xlsx';
 document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
