const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs'),ts=require('typescript');const out={};
new Function('exports',ts.transpileModule(fs.readFileSync('src/conversation-data.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(out);
const {retainRunHistory}=out;
const turn=i=>[{id:'u'+i,role:'user',text:'question '+i},{id:'a'+i,role:'assistant',text:'answer '+i}];
test('rolling pages retain displayed prefixes and paging cursor, but current page and requests stay authoritative',()=>{
 const previous={id:'r',turnOffset:20,historyBefore:'u20',messages:[...turn(20),...turn(21)],tools:[{id:'old',turnKey:'u20'},{id:'removed',turnKey:'u21'}],plans:[{turnKey:'u20'}],fileChanges:[{turnKey:'u20'}],taskApps:[{id:'app',turnKey:'u20'}],artifacts:[{id:'file',turnKey:'u20'}],approvals:[{id:'stale'}]};
 const incoming={id:'r',turnOffset:21,historyBefore:'u21',totalTurns:23,messages:[...turn(21),...turn(22)],tools:[{id:'new',turnKey:'u22'}],approvals:[],status:'running'};
 incoming.messages[1].text='corrected';
 const result=retainRunHistory(previous,incoming);
 assert.deepEqual(result.messages.map(m=>m.id),['u20','a20','u21','a21','u22','a22']);
 assert.equal(result.messages[3].text,'corrected');assert.equal(result.historyBefore,'u20');assert.equal(result.turnOffset,20);assert.equal(result.totalTurns,23);
 assert.deepEqual(result.tools.map(t=>t.id),['old','new']);assert.deepEqual(result.approvals,[]);assert.equal(result.status,'running');
 for(const field of ['plans','fileChanges','taskApps','artifacts'])assert.equal(result[field][0].turnKey,'u20');
 assert.deepEqual(retainRunHistory(result,incoming),result);
});
test('full replacements, summaries, other runs and disjoint pages are not treated as a scrolling prefix',()=>{
 const previous={id:'r',turnOffset:0,historyBefore:null,messages:[...turn(0),...turn(1)],tools:[]};
 for(const incoming of [
  {...previous,messages:turn(0)},
  {...previous,id:'other',turnOffset:1,historyBefore:'u1'},
  {...previous,summaryOnly:true,turnOffset:1,historyBefore:'u1'},
  {...previous,turnOffset:9,historyBefore:'u9',messages:turn(9)},
 ])assert.equal(retainRunHistory(previous,incoming),incoming);
});
