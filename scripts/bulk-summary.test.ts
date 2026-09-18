import test from 'node:test';
import assert from 'node:assert/strict';
import {buildBulkGroups,bulkTotal} from '../lib/bulk-summary';
import type {Product,Stock} from '../lib/inventory';
function product(sku:string,stock:Partial<Stock>={},name='Yawanawa'):Product{return {key:sku,sku,name,category:'Test',stocks:[{id:1,parentId:100,storeId:'maya',grams:100,quantity:10,status:'instock',packaging:'bulk',updatedAt:'',productName:name,...stock}]};}
test('bulk families show only 100/250/500g pots and total their actual mass per company',()=>{
 const products=[product('RAYA02-100'),product('RAYA0205',{id:2,storeId:'sacred',grams:250,quantity:4}),product('RAYA0208',{id:3,storeId:'pagnier',grams:500,quantity:6,quantityUnit:'un.'}),product('RAYA02-50',{id:4,grams:50,packaging:'can',quantity:1000}),product('RAYA0200',{id:5,storeId:'pagnier',grams:1000,quantityUnit:'kg',quantity:1000}),product('RAYA02-1000',{id:6,grams:1000,quantity:1000})];
 const groups=buildBulkGroups(products,['maya','sacred','pagnier']);
 assert.equal(groups.length,1);assert.equal(groups[0].code,'RAYA02');
 assert.equal(groups[0].sizes[100]?.maya?.quantity,10);assert.equal(groups[0].sizes[250]?.sacred?.quantity,4);assert.equal(groups[0].sizes[500]?.pagnier?.quantity,6);
 assert.equal(bulkTotal(groups).kg,5);assert.equal(bulkTotal(groups,'sacred').kg,1);
 assert.equal(bulkTotal(buildBulkGroups(products,['maya'])).kg,1);
});
test('unknown, absent, zero, negative and shared stock remain distinct',()=>{
 const products=[product('RAYA02-100',{quantity:null}),product('RAYA02-250',{id:2,grams:250,quantity:0}),product('RAYA02-500',{id:3,grams:500,quantity:-2}),product('RAYA0205',{id:4,storeId:'sacred',grams:250,quantity:100,shared:true}),product('RAYA0208',{id:5,storeId:'sacred',grams:500,quantity:100,packaging:'shared'})];
 const groups=buildBulkGroups(products,['maya','sacred']);
 assert.equal(groups[0].sizes[100]?.maya?.quantity,null);assert.equal(groups[0].sizes[250]?.maya?.quantity,0);assert.equal(groups[0].sizes[500]?.maya?.quantity,-2);
 assert.equal(groups[0].sizes[250]?.sacred,undefined);assert.equal(bulkTotal(groups).kg,0);assert.equal(bulkTotal(groups).partial,true);
});
test('duplicate source positions count once and same-name unrelated parents stay separate',()=>{
 const first=product('CUSTOM-A',{parentId:10}),second=product('CUSTOM-B',{id:2,parentId:10,grams:250});
 const groups=buildBulkGroups([first,first,second,product('CUSTOM-C',{id:3,parentId:20,grams:500})],['maya']);
 assert.equal(groups.length,2);assert.equal(bulkTotal(groups).kg,8.5);
 assert.equal(groups.find(g=>g.key==='parent:maya:10')?.sizes[100]?.maya?.quantity,10);
});
