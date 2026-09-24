import test from 'node:test';
import assert from 'node:assert/strict';
import { CATEGORY_TEMPLATE_VERSION, categoryTemplates, colorPresets, planTemplateSeed, similarCategory, templateDocId } from '../lib/category-templates.ts';

test('starter library is versioned, separated by type and has no transfer category',()=>{
 assert.equal(CATEGORY_TEMPLATE_VERSION,1);
 assert.equal(categoryTemplates.filter(t=>t.type==='expense').length,16);
 assert.equal(categoryTemplates.filter(t=>t.type==='income').length,6);
 assert.equal(categoryTemplates[0].name,'Makan & Minum');
 assert.ok(!categoryTemplates.some(t=>/^transfer$/i.test(t.name)));
 for(const t of categoryTemplates){assert.ok(t.icon&&t.subcategories.length>0,t.name);assert.ok(colorPresets.some(p=>p.key===t.color));for(const s of t.subcategories)assert.ok(s.icon&&s.name,s.key);}
 const keys=categoryTemplates.flatMap(t=>[t.key,...t.subcategories.map(s=>s.key)]);
 assert.equal(new Set(keys).size,keys.length);
});

test('a new user gets parents with colour and subcategories that inherit it',()=>{
 const records=planTemplateSeed([],['expense.makan-minum']);
 const parent=records.find(r=>!r.data.parentId);
 assert.equal(parent.data.name,'Makan & Minum');assert.equal(parent.data.icon,'🍜');assert.match(parent.data.color,/^#/);
 const subs=records.filter(r=>r.data.parentId===parent.id);
 assert.equal(subs.length,10);assert.equal(subs[0].data.name,'Sarapan');assert.equal(subs[0].data.color,'');
 assert.deepEqual(subs.map(s=>s.data.sortOrder),subs.map((_,i)=>i));
 assert.equal(parent.id,templateDocId('expense.makan-minum'));
});

test('seeding twice or over existing categories never duplicates or overwrites',()=>{
 const first=planTemplateSeed([],['expense.makan-minum','income.gaji']);
 const saved=first.map(r=>({id:r.id,...r.data}));
 assert.equal(planTemplateSeed(saved,['expense.makan-minum','income.gaji']).length,0);
 const custom=[{id:'mine',name:'makan dan minum',type:'expense',parentId:null,icon:'🍕',color:'#000000',sortOrder:3,isArchived:false}];
 assert.ok(similarCategory(custom,categoryTemplates[0]));
 const fill=planTemplateSeed(custom,['expense.makan-minum']);
 assert.equal(fill.length,10);assert.ok(fill.every(r=>r.data.parentId==='mine'));
 assert.equal(planTemplateSeed([...custom,...fill.map(r=>({id:r.id,...r.data}))],['expense.makan-minum']).length,0);
 const partial=[...custom,{id:'s1',name:'Sarapan',type:'expense',parentId:'mine',icon:'🍞',color:'',sortOrder:0,isArchived:false}];
 const rest=planTemplateSeed(partial,['expense.makan-minum']);
 assert.equal(rest.length,9);assert.ok(!rest.some(r=>r.data.name==='Sarapan'));assert.equal(rest[0].data.sortOrder,1);
 const forced=planTemplateSeed(custom,['expense.makan-minum'],true,'_copy');
 assert.ok(forced.every(r=>r.id.endsWith('_copy')&&r.id!=='mine'));
 assert.equal(forced.find(r=>!r.data.parentId).data.sortOrder,4);
 assert.equal(similarCategory(custom,categoryTemplates.find(t=>t.type==='income'&&t.name==='Gaji')),null);
});
