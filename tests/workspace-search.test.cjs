const {test}=require('node:test');const assert=require('node:assert/strict');const {searchWorkspace}=require('../electron/workspace-search.cjs');
test('search matches complete history, multiple partial terms and recency without including archives',()=>{
 const source={workspace:{projects:[{id:'p',name:'产品规划',description:'路线',createdAt:'2026-01-01'}],tasks:[]},extensions:{installed:[]},runs:[{id:'old',title:'旧任务',createdAt:'2026-01-01',messages:[{text:'产品 架构讨论'},...Array.from({length:100},()=>({text:'其他内容'}))]},{id:'new',title:'新任务',createdAt:'2026-09-01',messages:[]},{id:'archived',title:'产品',archivedAt:'today',messages:[]}],recent:{'task:old':'2026-09-29'}};
 assert.equal(searchWorkspace(source,'产品 架构','task')[0].id,'old');
 assert.equal(searchWorkspace(source)[0].id,'old');assert.equal(searchWorkspace(source,'产品').length,2);
 assert.equal(searchWorkspace(source,'产品','project')[0].id,'p');
});
test('skills are searchable by name and description within their own category',()=>{
 const source={workspace:{projects:[],tasks:[]},extensions:{installed:[]},runs:[],skills:[{id:'s',name:'设计',description:'产品原型',updatedAt:'2026-09-30'}]};
 assert.equal(searchWorkspace(source,'产品','skill')[0].id,'s');
 assert.equal(searchWorkspace(source,'产品','task').length,0);
});
