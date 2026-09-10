import type {ReplenishmentReport,ReplenishmentLine} from './replenishment';
const headers=['SKU','Produto','Apresentação','Estoque atual','Mínimo (un.)','Repor (un.)','Peso (kg)'];
const values=(r:ReplenishmentLine)=>[r.sku,r.product,r.variation,r.current??'N/D',r.minimum,r.order??'Revisar',r.kg??'N/D'];
const date=(s:string|null)=>s?new Date(s).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}):'Não informado';
export async function exportReplenishment(report:ReplenishmentReport,format:'pdf'|'xlsx'){
 const order=report.lines.filter(r=>r.status==='order'),review=report.lines.filter(r=>r.status==='review');
 const title='Pedido de reposição - Sacred';
 const note=`Estoque: ${date(report.lastSync)} (Brasília). Gerado: ${date(report.generatedAt)}.${report.warning?' ATENÇÃO: atualização falhou; revisar estoque.':''}`;
 const total=order.reduce((sum,r)=>sum+r.order!,0),weight=order.reduce((sum,r)=>sum+(r.kg??0),0);
 const summary=`${order.length} SKUs | ${total} unidades | ${weight.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:6})} kg${order.some(r=>r.kg===null)?' (peso parcial)':''} | ${review.length} itens para revisão`;
 const filename='Reposicao_Sacred_'+report.generatedAt.slice(0,10);
 if(format==='xlsx'){
  const ExcelJS=await import('exceljs');const workbook=new ExcelJS.Workbook();workbook.creator='MS Lumiar';workbook.created=new Date(report.generatedAt);
  for(const [name,lines] of [['Pedido',order],['Revisar',review],['Mínimos cadastrados',report.lines]] as const){
   const sheet=workbook.addWorksheet(name);sheet.addRow([title]);sheet.addRow([note]);sheet.addRow([summary]);sheet.addRow(['Base: '+report.source]);sheet.addRow(['Repor = mínimo - disponível. Saldos negativos contam como zero. Itens para revisão não entram no pedido.']);sheet.addRow([...headers,'Observação']);
   lines.forEach(r=>sheet.addRow([...values(r),r.reason??'']));
   sheet.columns.forEach((col,i)=>{col.width=[19,55,27,18,18,18,18,48][i];});
   sheet.getRow(6).font={bold:true,color:{argb:'FFFFFFFF'}};sheet.getRow(6).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF226B5B'}};
   sheet.views=[{state:'frozen',ySplit:6}];sheet.autoFilter={from:'A6',to:'H'+Math.max(6,sheet.rowCount)};
   sheet.getColumn(7).numFmt='0.00####';sheet.eachRow((row,i)=>{if(i>6)row.alignment={vertical:'top',wrapText:true};});
  }
  const buffer=await workbook.xlsx.writeBuffer();download(new Blob([new Uint8Array(buffer)],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),filename+'.xlsx');
 }else{
  const {jsPDF}=await import('jspdf');const {autoTable}=await import('jspdf-autotable');const doc=new jsPDF({orientation:'landscape'});
  doc.setFontSize(18);doc.text(title,14,17);doc.setFontSize(9);doc.text(note,14,25);doc.text(summary,14,31);
  doc.text('Reposição até o mínimo de 3 meses. Saldos negativos contam como zero disponível.',14,37);
  doc.text('Base: '+report.source,14,43);
  const pdfValue=(v:string|number)=>String(v).replace(/⅜/g,'3/8').replace(/⅛/g,'1/8').replace(/⅝/g,'5/8').replace(/⅞/g,'7/8');
  autoTable(doc,{startY:49,head:[headers],body:order.map(r=>values(r).map(pdfValue)),styles:{fontSize:9,cellPadding:3},headStyles:{fillColor:[34,107,91]},columnStyles:{1:{cellWidth:82},2:{cellWidth:42}},margin:{bottom:18}});
  if(review.length){doc.addPage();doc.setFontSize(15);doc.text('Itens para revisão - não incluídos no pedido',14,17);autoTable(doc,{startY:25,head:[['SKU','Produto','Apresentação','Mínimo','Motivo']],body:review.map(r=>[r.sku,r.product,r.variation,r.minimum,r.reason??''].map(pdfValue)),styles:{fontSize:9},headStyles:{fillColor:[110,100,64]},margin:{bottom:18}});}
  const pages=doc.getNumberOfPages();for(let p=1;p<=pages;p++){doc.setPage(p);doc.setFontSize(8);doc.text(`MS Lumiar | Sacred | ${p} / ${pages}`,14,202);}
  doc.save(filename+'.pdf');
 }
}
function download(blob:Blob,name:string){const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}
