import test from 'node:test';import assert from 'node:assert/strict';
import {attachCategoryTree,categoryPath,type CategoryNode} from '../lib/category-tree';
import {availableCategories,filterCategory} from '../lib/category-filter';
import {sacredReplenishment,filterReplenishmentReport} from '../lib/replenishment';
import {readCategoryTree} from '../lib/category-tree-cache';
import type {Product} from '../lib/inventory';
const nodes:CategoryNode[]=[{id:1,name:'Rapé',parent:0},{id:2,name:'Tribal',parent:1},{id:3,name:'Yawanawa',parent:2},{id:4,name:'Ervas',parent:0},{id:5,name:'Tribal',parent:4}];
const product=(id:number):Product=>({key:'sku:'+id,sku:String(id),name:'Product',category:'Yawanawa',stocks:[{storeId:'sacred',id,quantity:3,grams:10,status:'instock',updatedAt:'now',categories:[nodes.find(n=>n.id===id)!.name],categoryIds:[id]}]});
test('parents without direct assignments appear and include all descendants, with branches disambiguated',()=>{
 const products=[3,5].map(id=>attachCategoryTree(product(id),nodes));
 assert.deepEqual(availableCategories(products,'sacred'),['Ervas','Ervas › Tribal','Rapé','Rapé › Tribal','Rapé › Tribal › Yawanawa']);
 assert.equal(filterCategory(products,'sacred','Rapé').length,1);
 assert.equal(filterCategory(products,'sacred','Rapé › Tribal')[0].sku,'3');
 assert.equal(filterCategory(products,'sacred',['Rapé','Ervas']).length,2);
 assert.equal(filterCategory(products,'maya','Rapé').length,0);
 assert.equal(filterCategory(products,'sacred','Tribal').length,0);
 const lines=sacredReplenishment([{sku:'3',product:'Product',variation:'10g',minimum:10}],products);
 assert.ok(lines[0].categories!.includes('Rapé'));
 const report=filterReplenishmentReport({source:'CSV',lastSync:null,generatedAt:'now',lines},['Rapé']);assert.equal(report.lines.length,1);assert.equal(report.lines[0].order,7);
});
test('old cached category names recover unique ancestry, cycles do not loop',()=>{
 const p=product(3);delete p.stocks[0].categoryIds;
 assert.deepEqual(attachCategoryTree(p,nodes).stocks[0].categoryPaths,[['Rapé','Tribal','Yawanawa']]);
 assert.deepEqual(categoryPath({id:1,name:'A',parent:2},[{id:1,name:'A',parent:2},{id:2,name:'B',parent:1}]),['A']);
});
test('category reader requests empty parents and paginates without persisting a partial taxonomy',async()=>{
 let requests=0;
 const request=(async input=>{const url=new URL(String(input));assert.equal(url.pathname,'/wp-json/wc/v3/products/categories');assert.equal(url.searchParams.get('hide_empty'),'false');requests++;
  return Response.json(requests===1?Array.from({length:100},(_,i)=>({id:i+1,name:'Category '+i,parent:0})):[{id:101,name:'Leaf',parent:1}],{headers:{'X-WP-TotalPages':'2'}});
 }) as typeof fetch;
 assert.equal((await readCategoryTree('sacred',{key:'key',secret:'secret'},request)).length,101);assert.equal(requests,2);
 await assert.rejects(readCategoryTree('sacred',{key:'key',secret:'secret'},(async()=>Response.json([{id:1,name:'No parent'}])) as typeof fetch));
});
