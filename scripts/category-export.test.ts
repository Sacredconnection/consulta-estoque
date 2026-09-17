import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import {availableCategories,filterCategory} from '../lib/category-filter';
import {buildStockRows} from '../lib/stock-table';
import {stockWorkbook} from '../lib/stock-export';
import type {Product} from '../lib/inventory';
import {buildNomusWorkbook,NOMUS_HEADERS,nomusDates} from '../lib/nomus-export';
import {filterReplenishmentReport,type ReplenishmentReport} from '../lib/replenishment';

test('Nomus matches filled template defaults and keeps fractional quantities',async()=>{
 const report:ReplenishmentReport={storeId:'pagnier',source:'test',generatedAt:'2026-09-17',lastSync:null,lines:[
  {sku:'00100',product:'=1+1',variation:'kg',unit:'kg',minimum:3,current:2.27,order:.73,kg:.73,status:'order',categories:['A']},
  {sku:'L',product:'Liquid',variation:'L',unit:'L',minimum:1,current:0,order:1,kg:null,status:'order',categories:['B']},
  {sku:'REVIEW',product:'Review',variation:'',minimum:1,current:null,order:null,kg:null,status:'review'},
  {sku:'OK',product:'OK',variation:'',minimum:1,current:1,order:0,kg:0,status:'ok'},
 ]};
 const details={order:'R-001',customer:'Customer'};
 const workbook=await buildNomusWorkbook(report,details,new Date('2026-09-17T15:00:00Z')),saved=new ExcelJS.Workbook();
 await saved.xlsx.load(await workbook.xlsx.writeBuffer());
 const sheet=saved.getWorksheet('Pedidos de Vendas')!;
 assert.deepEqual((sheet.getRow(1).values as unknown[]).slice(1),NOMUS_HEADERS);
 assert.equal(sheet.columnCount,26);assert.equal(sheet.rowCount,3);
 assert.equal(sheet.getCell('G2').value,'00100');assert.equal(sheet.getCell('H2').value,'=1+1');
 assert.equal(sheet.getCell('L2').value,.73);assert.equal(sheet.getCell('K2').value,'KG');assert.equal(sheet.getCell('K3').value,'LITRO');
 assert.equal(sheet.getCell('M2').value,10);assert.equal(sheet.getCell('C2').value,'PAGNIER COMERCIO LTDA');
 assert.equal((sheet.getCell('D2').value as Date).toISOString(),'2026-09-17T00:00:00.000Z');
 assert.equal((sheet.getCell('N2').value as Date).toISOString(),'2026-10-17T00:00:00.000Z');
 assert.equal(sheet.getCell('A3').value,'R-001');assert.equal(sheet.getCell('F3').value,2);
 const filtered=await buildNomusWorkbook(filterReplenishmentReport(report,['B']),details);
 assert.equal(filtered.getWorksheet('Pedidos de Vendas')!.rowCount,2);
 await assert.rejects(buildNomusWorkbook(report,{...details,customer:''}));
 await assert.rejects(buildNomusWorkbook({...report,lines:[]},details));
 const maya=await buildNomusWorkbook({...report,storeId:'maya',lines:[{...report.lines[0],unit:undefined,order:10}]},details);
 assert.equal(maya.getWorksheet('Pedidos de Vendas')!.getCell('K2').value,'UNIDADE');
});
test('Nomus delivery adds a calendar month, clamping end-of-month and using Brasilia dates',()=>{
 for(const [input,issued,delivery] of [
  ['2026-01-31T15:00:00Z','2026-01-31','2026-02-28'],
  ['2028-01-31T15:00:00Z','2028-01-31','2028-02-29'],
  ['2026-12-31T15:00:00Z','2026-12-31','2027-01-31'],
  ['2026-09-18T01:00:00Z','2026-09-17','2026-10-17'],
 ]){
  const dates=nomusDates(new Date(input));
  assert.equal(dates.issued.toISOString().slice(0,10),issued);
  assert.equal(dates.delivery.toISOString().slice(0,10),delivery);
 }
});

const products:Product[]=[{key:'sku:ONE',sku:'ONE',name:'=1+1',category:'Wholesale',stocks:[
 {id:1,storeId:'sacred',quantity:5,status:'instock',updatedAt:'2026-09-10',grams:10,categories:['Varejo','Rapé']},
 {id:2,storeId:'maya',quantity:7,status:'instock',updatedAt:'2026-09-10',grams:10,categories:['Herbs','Tribal']},
]},{key:'sku:TWO',sku:'TWO',name:'Other',category:'Other category',stocks:[{id:3,storeId:'maya',quantity:null,status:'unknown',updatedAt:'2026-09-10',grams:50}]}];
test('categories are scoped to source metadata and match whole category names',()=>{
 assert.deepEqual(availableCategories(products,'maya'),['Herbs','Other category','Tribal']);
 assert.deepEqual(availableCategories(products,'sacred'),['Rapé','Varejo']);
 const result=filterCategory(products,'sacred','rape');
 assert.equal(result.length,1);assert.equal(result[0].stocks.length,1);assert.equal(result[0].stocks[0].storeId,'sacred');
 assert.equal(filterCategory(products,'maya','Rapé').length,0);
 assert.equal(filterCategory(products,'maya','Herb').length,0);
 assert.equal(filterCategory(products,'maya',['Herbs','Other category']).length,2);
 assert.equal(filterCategory(products,'maya',['Herbs','Tribal','Herbs']).length,1);
 assert.equal(filterCategory(products,'maya',[]).length,2);
});
test('Excel retains numeric quantities, unknowns, totals and literal product strings',async()=>{
 const rows=buildStockRows(products),data=await stockWorkbook(rows,['maya'],'Categoria: Herbs');
 const wb=new ExcelJS.Workbook();await wb.xlsx.load(data);
 const sheet=wb.getWorksheet('Estoque')!;
 assert.equal(sheet.getRow(2).getCell(1).value,'Categoria: Herbs');
 assert.equal(sheet.getRow(6).getCell(2).value,'=1+1');
 assert.equal(sheet.getRow(6).getCell(4).value,7);
 assert.equal(sheet.getRow(6).getCell(6).value,0.07);
 assert.equal(sheet.getRow(7).getCell(4).value,'N/D');
 assert.equal(sheet.getRow(8).getCell(6).value,0.07);
 assert.equal(sheet.getRow(8).getCell(10).value,'Total parcial');
 assert.ok(!(sheet.getRow(5).values as unknown[]).some(x=>String(x).includes('Sacred')));
 assert.equal(sheet.rowCount,9);
});
