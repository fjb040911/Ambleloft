const {test}=require('node:test');
const assert=require('node:assert/strict');
const {TerminalService,dimensions}=require('../electron/terminal.cjs');
function fixture(resolveContext=async()=>({projectId:'p',cwd:'/tmp'})){
 const processes=[];
 const service=new TerminalService({resolveContext,profiles:[{id:'/bin/sh',name:'sh',args:['-l']}],spawn:()=>{
  const p={killed:false,paused:false,writes:[],onData(fn){this.emit=fn;return {dispose(){}};},onExit(fn){this.exit=fn;return {dispose(){}};},pause(){this.paused=true;},resume(){this.paused=false;},write(data){this.writes.push(data);},resize(cols,rows){this.size=[cols,rows];},kill(){this.killed=true;}};processes.push(p);return p;
 }});return {service,processes};
}
test('sessions are isolated by window; hide/list does not kill and explicit close cleans up',async()=>{
 const {service,processes}=fixture();const owner={id:'one'},other={id:'two'};
 const s=await service.create(owner);assert.equal(service.list(other).length,0);
 for(const action of ['read','write','resize','close'])assert.throws(()=>service[action](other,{id:s.id,data:'bad',cols:80,rows:24}),/not found/);
 service.write(owner,{id:s.id,data:'echo hi\r'});assert.deepEqual(processes[0].writes,['echo hi\r']);
 service.list(owner);assert.equal(processes[0].killed,false);
 service.closeOwner(owner);assert.equal(processes[0].killed,true);assert.equal(service.list(owner).length,0);
});
test('unobserved output drains with backpressure and restores both VT buffers at exit',async()=>{
 const {service,processes}=fixture();const owner={id:'one'},s=await service.create(owner),p=processes[0];
 const exited=new Promise(resolve=>{service.onExit=resolve;});
 p.emit('x'.repeat(300000));assert.equal(p.paused,true);
 // Let the host consume the high-water batch without a renderer.
 while(p.paused)await new Promise(resolve=>setTimeout(resolve,5));
 p.emit('NORMAL-END\x1b[?1049h\x1b[H\x1b[3;2Hscreen-OLD\x1b[3;9HNEW');
 p.exit({exitCode:2});await exited;
 const frame=service.attach(owner,{id:s.id,token:'visible'});
 assert.equal(frame.exited,true);assert.equal(frame.exitCode,2);
 const {Terminal}=require('@xterm/headless');
 const restored=new Terminal({allowProposedApi:true,cols:frame.cols,rows:frame.rows,scrollback:5000});
 await new Promise(resolve=>restored.write(frame.data,resolve));
 assert.equal(restored.buffer.active.type,'alternate');
 assert.equal(restored.buffer.active.getLine(2).translateToString(true),' screen-NEW');
 assert.match(frame.data,/NORMAL-END/);
 assert.throws(()=>service.write(owner,{id:s.id,data:'x'}),/退出/);
 restored.dispose();service.shutdown();assert.equal(service.sessions.size,0);
});
test('an idle read sleeps until data and stale cleanup cannot detach a replacement',async()=>{
 const {service,processes}=fixture();const owner={id:'one'},s=await service.create(owner);
 const a={id:s.id,token:'first'},b={id:s.id,token:'next'};
 service.attach(owner,a);
 const pending=service.read(owner,a);service.attach(owner,b);assert.equal(await pending,null);
 service.detach(owner,a);
 const changed=service.read(owner,b);
 processes[0].emit('one');processes[0].emit('two');
 assert.equal((await changed).data,'onetwo');
 const idle=service.read(owner,b);
 service.close(owner,s);assert.equal(await idle,null);
});
test('a window closed during directory resolution cannot spawn an orphan',async()=>{
 let resolve;const {service,processes}=fixture(()=>new Promise(r=>resolve=r));const owner={id:'one'};
 const pending=service.create(owner);service.closeOwner(owner);resolve({cwd:'/tmp',projectId:''});
 await assert.rejects(pending,/closed/);assert.equal(processes.length,0);
});
test('invalid shells, dimensions and oversized writes are rejected',async()=>{
 const {service,processes}=fixture();const owner={id:'one'};
 await assert.rejects(service.create(owner,{shell:'/invalid'}),/Shell/);
 for(const cols of [0,-1,Infinity,1.5,501])assert.throws(()=>dimensions({cols,rows:24}));
 const s=await service.create(owner);assert.throws(()=>service.write(owner,{id:s.id,data:'x'.repeat(65537)}));
 service.resize(owner,{id:s.id,cols:100,rows:40});assert.deepEqual(processes[0].size,[100,40]);
});

test('restored terminal descriptors keep task, draft and project sessions distinct',async()=>{
 const {service}=fixture(async input=>({projectId:'p',runId:input.runId,cwd:'/tmp'}));
 const owner={id:'window'};
 await service.create(owner,{runId:'run-a',viewId:'ignored'});
 await service.create(owner,{viewId:'draft:d'});
 await service.create(owner);
 assert.deepEqual(service.list(owner).map(({runId,viewId})=>[runId,viewId]),[
  ['run-a',undefined],[undefined,'draft:d'],[undefined,undefined],
 ]);
 service.shutdown();
});
test('reattaching during an incomplete control sequence preserves the next screen update',async()=>{
 const {service,processes}=fixture(), owner={id:'window'};
 const s=await service.create(owner), a={id:s.id,token:'one'}, b={id:s.id,token:'two'};
 service.attach(owner,a);
 const first=service.read(owner,a);
 processes[0].emit('start\x1b[');
 await first;
 const oldRead=service.read(owner,a);
 service.detachOwner(owner);
 assert.equal(await oldRead,null);
 service.attach(owner,b);
 const next=service.read(owner,b);
 processes[0].emit('2;1Hnext');
 const frame=await next;
 assert.equal(frame.snapshot,true);
 assert.doesNotMatch(frame.data,/2;1Hnext/);
 assert.match(frame.data,/next/);
 service.shutdown();
});
test('a slow view re-synchronizes from a bounded screen and clearing persists across reopen',async()=>{
 const {service,processes}=fixture(),owner={id:'window'};
 const s=await service.create(owner),a={id:s.id,token:'one'};
 service.attach(owner,a);
 processes[0].emit('line\r\n'.repeat(60000)+'tail');
 const update=await service.read(owner,a);
 assert.equal(update.snapshot,true);
 assert.ok(update.data.length<100000);
 assert.match(update.data,/tail/);
 const cleared=service.read(owner,a);
 service.clear(owner,s);
 assert.equal((await cleared).snapshot,true);
 assert.doesNotMatch(service.attach(owner,{id:s.id,token:'two'}).data,/line/);
 service.shutdown();
});
