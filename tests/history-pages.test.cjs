const test=require('node:test');const assert=require('node:assert/strict');const {pageRun,summary}=require('../electron/history-pages.cjs');
test('history pages use stable turn cursors, preserve tool association, and omit bodies from index',()=>{
 const run={id:'r',messages:Array.from({length:100},(_,i)=>[{id:'u'+i,role:'user',text:'question'},{id:'a'+i,role:'assistant',text:'answer'}]).flat(),tools:[{id:'t',turnKey:'u10',detail:'large output'}],plans:[],fileChanges:[{turnKey:"u10",files:[{path:"old.md"}]}],artifacts:[],approvals:[]};
 const recent=pageRun(run);assert.equal(recent.messages.length,60);assert.equal(recent.turnOffset,70);assert.equal(recent.historyBefore,'u70');assert.equal(recent.tools.length,0);
 run.messages.push({id:'u100',role:'user',text:'new'});
 const older=pageRun(run,recent.historyBefore);assert.equal(older.messages[0].id,'u40');assert.equal(older.messages.at(-1).id,'a69');
 assert.equal(pageRun(run,'u30').tools[0].id,'t');assert.equal(pageRun(run,'u30').historyBefore,null);
 assert.equal(pageRun(run,"u30").fileChanges.length,1);assert.equal(recent.fileChanges.length,0);assert.equal(summary(run).fileChanges,undefined);
 assert.equal(summary(run).messages.length,0);assert.equal(summary(run).tools.length,0);
 assert.throws(()=>pageRun(run,'missing'));assert.throws(()=>pageRun(run,undefined,10000));
});
