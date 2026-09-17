import test from 'node:test';
import assert from 'node:assert/strict';
import {sacredReplenishment} from '../lib/replenishment';
import {visibleCatalog} from '../lib/catalog-visibility';
import type {Product} from '../lib/inventory';
const make=(sku:string,quantity:number|null,storeId:'sacred'|'maya'|'pagnier'='sacred'):Product=>({key:sku,sku,name:'Produto',category:'',stocks:[{id:1,storeId,quantity,grams:10,status:'instock',updatedAt:'now'}]});
const pg=(sku:string,id:number,quantity:number|null,quantityUnit:string,grams:number|null,name='Produto'):Product=>({key:String(id),sku,name,category:'',stocks:[{id,parentId:id,storeId:'pagnier',quantity,quantityUnit,grams,productName:name,status:'instock',updatedAt:'now'}]});
test('Pagnier aggregates parent and all packaged children in kg without order rounding',()=>{
 const minimum={sku:'RASC2300',product:'Rapé Kg',variation:'',minimum:3,unit:'kg' as const};
 const parent=pg('RASC2300',1,1,'kg',1000);
 const child=pg('RASC2301',2,2,'un.',500);
 const products=[parent,child,child,pg('RASC2302',3,1,'un.',250),pg('RASC2303',4,1,'un.',100),pg('RASC2401',5,100,'un.',500),make('RASC2300',100,'maya')];
 const [line]=sacredReplenishment([minimum],products,'pagnier');
 assert.equal(line.current,2.35);assert.equal(line.order,.65);assert.equal(line.kg,.65);assert.equal(line.status,'order');
 assert.equal(sacredReplenishment([minimum],products.slice(1),'pagnier')[0].current,1.35);
 const otherLocation=pg('RASC2300',6,.7,'kg',1000);
 assert.equal(sacredReplenishment([minimum],[...products,otherLocation],'pagnier')[0].order,0);
});
test('Pagnier uses liters and ml, not mass, and preserves unknown quantities and conversions for review',()=>{
 const minimum={sku:'SASC0300',product:'Sananga L',variation:'',minimum:.5,unit:'L' as const};
 const parent=pg('SASC0300',1,.04,'LITRO',null),child=pg('SASC0310',2,10,'un.',20,'Sananga 10 ml');
 const [line]=sacredReplenishment([minimum],[parent,child],'pagnier');
 assert.equal(line.current,.14);assert.equal(line.order,.36);assert.equal(line.kg,null);
 for(const bad of [pg('SASC0310',2,null,'un.',null,'Sananga 10 ml'),pg('SASC0310',2,2,'un.',500,'Sananga')]){
  assert.equal(sacredReplenishment([minimum],[parent,bad],'pagnier')[0].status,'review');
 }
 child.stocks[0].shared=true;
 assert.equal(sacredReplenishment([minimum],[parent,child],'pagnier')[0].status,'review');
});
test('Pagnier converts grams, ignores negative availability, and keeps fractional minima',()=>{
 const minimum={sku:'CZMS0100',product:'Cinza Kg',variation:'',minimum:.5,unit:'kg' as const};
 const products=[pg('CZMS0100',1,-2,'kg',1000),pg('CZMS0101',2,125,'g',1)];
 const [line]=sacredReplenishment([minimum],products,'pagnier');
 assert.equal(line.current,.125);assert.equal(line.order,.375);
 assert.equal(sacredReplenishment([{...minimum,minimum:0}],products,'pagnier')[0].order,0);
});
test('Sacred minima use only live Sacred balances, preserving unknown/shared/duplicate cases for review',()=>{
 const minima=['A','B','C','D','E','F'].map(sku=>({sku,product:'Produto',variation:'10g',minimum:10}));
 const shared=make('D',5);shared.stocks[0].shared=true;
 const duplicate=make('E',3);duplicate.stocks.push({...duplicate.stocks[0],id:2});
 const lines=sacredReplenishment(minima,[make('A',4),make('A',100,'maya'),make('B',-3),make('C',null),shared,duplicate,make('F',20,'pagnier')]);
 assert.equal(lines[0].order,10);assert.equal(lines[0].kg,.1);assert.equal(lines[1].order,10);
 assert.equal(lines.length,5);assert.ok(!lines.some(r=>r.sku==='F'));
 assert.ok(lines.slice(2).every(r=>r.order===null&&r.status==='review'));
 assert.equal(sacredReplenishment([{...minima[0],minimum:0}],[make('A',-5)])[0].order,0);
 assert.equal(sacredReplenishment([minima[0]],[make('A',10)])[0].status,'ok');
});
test('selected company excludes CSV-only and other-company SKUs, and uses integration names',()=>{
 const minimum={sku:'A',product:'CSV name',variation:'CSV variation',minimum:10};
 const sacred=make('A',4),maya=make('A',8,'maya');sacred.stocks[0].productName='Sacred name';
 assert.equal(sacredReplenishment([minimum],[sacred,maya])[0].product,'Sacred name');
 assert.equal(sacredReplenishment([minimum],[sacred,maya],'maya')[0].order,10);
 assert.equal(sacredReplenishment([minimum],[maya]).length,0);
 assert.equal(sacredReplenishment([minimum],[]).length,0);
});
test('Pagnier labels disappear from cached products without affecting other stores',()=>{
 const p=make('A',1,'pagnier');p.name='ETIQUETA Rapé';p.stocks.push({...p.stocks[0],storeId:'sacred',productName:'Produto Sacred'});
 const visible=visibleCatalog([p,make('B',3,'pagnier')]);assert.equal(visible.length,2);assert.deepEqual(visible[0].stocks.map(s=>s.storeId),['sacred']);
});
import {filterReplenishmentReport,type ReplenishmentReport} from '../lib/replenishment';
test('replenishment categories accumulate without duplicating lines and preserve review items',()=>{
 const report:ReplenishmentReport={source:'test',lastSync:null,generatedAt:'now',lines:[
  {sku:'A',product:'A',variation:'',minimum:10,current:2,order:10,kg:.1,status:'order',categories:['Rapé','Latas']},
  {sku:'B',product:'B',variation:'',minimum:10,current:null,order:null,kg:null,status:'review',categories:['Ervas']},
  {sku:'C',product:'C',variation:'',minimum:10,current:10,order:0,kg:0,status:'ok',categories:['Outros']},
 ]};
 assert.deepEqual(filterReplenishmentReport(report,['Rapé','Latas','Ervas']).lines.map(l=>l.sku),['A','B']);
 assert.equal(filterReplenishmentReport(report,['Ausente']).lines.length,0);
 assert.equal(filterReplenishmentReport(report,[]).lines.length,3);
 assert.equal(report.lines.length,3);
 const searched=filterReplenishmentReport(report,['Ervas'],' b ');
 assert.deepEqual(searched.lines.map(line=>line.sku),['B']);
 assert.equal(searched.lines[0].order,null);
 assert.equal(searched.search,'b');
 assert.equal(filterReplenishmentReport(report,['Rapé'],'B').lines.length,0);
});
test('replenishment rounds positive deficits up to multiples of ten and calculates weight from rounded units',()=>{
 for(const [minimum,current,expected] of [[10,7,10],[20,9,20],[20,0,20],[10,10,0],[10,15,0],[11,-4,20],[10,9.5,10],[30,9.5,30],[0,0,0]]){
  const line=sacredReplenishment([{sku:'A',product:'A',variation:'10g',minimum}],[make('A',current)])[0];
  assert.equal(line.order,expected,`minimum=${minimum}, current=${current}`);
  assert.equal(line.kg,expected*10/1000);assert.equal(line.status,expected?'order':'ok');
 }
});
