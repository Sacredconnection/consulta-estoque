import test from 'node:test';
import assert from 'node:assert/strict';
import {sacredReplenishment} from '../lib/replenishment';
import {visibleCatalog} from '../lib/catalog-visibility';
import type {Product} from '../lib/inventory';
const make=(sku:string,quantity:number|null,storeId:'sacred'|'maya'|'pagnier'='sacred'):Product=>({key:sku,sku,name:'Produto',category:'',stocks:[{id:1,storeId,quantity,grams:10,status:'instock',updatedAt:'now'}]});
test('Sacred minima use only live Sacred balances, preserving unknown/shared/duplicate cases for review',()=>{
 const minima=['A','B','C','D','E','F'].map(sku=>({sku,product:'Produto',variation:'10g',minimum:10}));
 const shared=make('D',5);shared.stocks[0].shared=true;
 const duplicate=make('E',3);duplicate.stocks.push({...duplicate.stocks[0],id:2});
 const lines=sacredReplenishment(minima,[make('A',4),make('A',100,'maya'),make('B',-3),make('C',null),shared,duplicate,make('F',20,'pagnier')]);
 assert.equal(lines[0].order,6);assert.equal(lines[0].kg,.06);assert.equal(lines[1].order,10);
 assert.equal(lines.length,5);assert.ok(!lines.some(r=>r.sku==='F'));
 assert.ok(lines.slice(2).every(r=>r.order===null&&r.status==='review'));
 assert.equal(sacredReplenishment([{...minima[0],minimum:0}],[make('A',-5)])[0].order,0);
 assert.equal(sacredReplenishment([minima[0]],[make('A',10)])[0].status,'ok');
});
test('selected company excludes CSV-only and other-company SKUs, and uses integration names',()=>{
 const minimum={sku:'A',product:'CSV name',variation:'CSV variation',minimum:10};
 const sacred=make('A',4),maya=make('A',8,'maya');sacred.stocks[0].productName='Sacred name';
 assert.equal(sacredReplenishment([minimum],[sacred,maya])[0].product,'Sacred name');
 assert.equal(sacredReplenishment([minimum],[sacred,maya],'maya')[0].order,2);
 assert.equal(sacredReplenishment([minimum],[maya]).length,0);
 assert.equal(sacredReplenishment([minimum],[]).length,0);
});
test('Pagnier labels disappear from cached products without affecting other stores',()=>{
 const p=make('A',1,'pagnier');p.name='ETIQUETA Rapé';p.stocks.push({...p.stocks[0],storeId:'sacred',productName:'Produto Sacred'});
 const visible=visibleCatalog([p,make('B',3,'pagnier')]);assert.equal(visible.length,2);assert.deepEqual(visible[0].stocks.map(s=>s.storeId),['sacred']);
});
