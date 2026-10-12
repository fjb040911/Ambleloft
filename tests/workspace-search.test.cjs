const {test}=require('node:test');const assert=require('node:assert/strict');const {searchWorkspace}=require('../electron/workspace-search.cjs');
test('search matches complete history, multiple partial terms and recency without including archives',()=>{
 const source={workspace:{projects:[{id:'p',name:'产品规划',description:'路线',createdAt:'2026-01-01'}],tasks:[]},extensions:{installed:[]},runs:[{id:'old',title:'旧任务',createdAt:'2026-01-01',messages:[{role:'user',text:'产品 架构讨论'},...Array.from({length:100},()=>({role:'assistant',phase:'commentary',text:'其他内容'}))]},{id:'new',title:'新任务',createdAt:'2026-09-01',messages:[]},{id:'archived',title:'产品',archivedAt:'today',messages:[]}],recent:{'task:old':'2026-09-29'}};
 assert.equal(searchWorkspace(source,'产品 架构','task')[0].id,'old');
 assert.equal(searchWorkspace(source)[0].id,'old');assert.equal(searchWorkspace(source,'产品').length,2);
 assert.equal(searchWorkspace(source,'产品','project')[0].id,'p');
});
test('skills are searchable by name and description within their own category',()=>{
 const source={workspace:{projects:[],tasks:[]},extensions:{installed:[]},runs:[],skills:[{id:'s',name:'设计',description:'产品原型',updatedAt:'2026-09-30'}]};
 assert.equal(searchWorkspace(source,'产品','skill')[0].id,'s');
 assert.equal(searchWorkspace(source,'产品','task').length,0);
});

test('snippet finds a content keyword when the first query word only matches the title',()=>{
 const result=searchWorkspace({runs:[{id:'r',title:'Architecture',createdAt:'2026-01-01',messages:[{role:'user',text:'Background '.repeat(100)+'needle implementation'}]}],workspace:{tasks:[],projects:[]},extensions:{installed:[]}},'Architecture needle','task');
 assert.equal(result.length,1);assert.ok(result[0].snippet.includes('needle'));assert.ok(result[0].snippet.startsWith('…'));
});

test('search and snippets exclude reasoning, commentary and tool output but retain prompts and finals',()=>{
 const source={workspace:{tasks:[],projects:[]},extensions:{installed:[]},runs:[{id:'r',title:'Visible title',status:'completed',messages:[
  {role:'user',text:'User question'},
  {role:'assistant',kind:'reasoning',text:'reasoningOnly'},
  {role:'assistant',phase:'commentary',text:'progressOnly'},
  {role:'assistant',text:'unclassifiedIntermediate'},
  {role:'tool',text:'toolOnly'},
  {role:'assistant',phase:'final_answer',text:'Final conclusion'},
 ],tools:[{detail:'toolOnly'}]}]};
 for(const query of ['reasoningOnly','progressOnly','unclassifiedIntermediate','toolOnly','User reasoningOnly'])assert.equal(searchWorkspace(source,query,'task').length,0,query);
 for(const query of ['Visible','User','conclusion'])assert.equal(searchWorkspace(source,query,'task').length,1,query);
 const snippet=searchWorkspace(source,'Visible','task')[0].snippet;
 assert.ok(snippet.includes('User question'));assert.ok(snippet.includes('Final conclusion'));
 assert.doesNotMatch(snippet,/reasoningOnly|progressOnly|unclassifiedIntermediate|toolOnly/);
});

test('legacy turns only index their last unclassified answer after completion',()=>{
 const run={id:'r',title:'Task',status:'running',messages:[
  {role:'user',text:'First question',timing:{outcome:'completed'}},
  {role:'assistant',text:'oldProgress'},
  {role:'assistant',text:'oldFinal'},
  {role:'user',text:'Second question'},
  {role:'assistant',text:'currentProgress'},
 ]};
 const source={workspace:{tasks:[],projects:[]},extensions:{installed:[]},runs:[run]};
 assert.equal(searchWorkspace(source,'oldProgress','task').length,0);
 assert.equal(searchWorkspace(source,'oldFinal','task').length,1);
 assert.equal(searchWorkspace(source,'currentProgress','task').length,0);
 run.status='completed';assert.equal(searchWorkspace(source,'currentProgress','task').length,1);
 run.status='interrupted';assert.equal(searchWorkspace(source,'currentProgress','task').length,0);
});
