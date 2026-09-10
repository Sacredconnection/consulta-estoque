import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import {availableCategories,filterCategory} from '../lib/category-filter';
import {buildStockRows} from '../lib/stock-table';
import {stockWorkbook} from '../lib/stock-export';
import type {Product} from '../lib/inventory';

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
