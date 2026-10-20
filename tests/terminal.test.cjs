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
test('output backpressure resumes after consumption; exit output is retained',async()=>{
 const {service,processes}=fixture();const owner={id:'one'},s=await service.create(owner),p=processes[0];
 p.emit('x'.repeat(300000));assert.equal(p.paused,true);assert.equal(service.read(owner,s).data.length,300000);assert.equal(p.paused,false);
 p.emit('last line');p.exit({exitCode:2});assert.deepEqual(service.read(owner,s),{data:'last line',exited:true,exitCode:2});
 assert.throws(()=>service.write(owner,{id:s.id,data:'x'}),/退出/);
 service.shutdown();assert.equal(service.sessions.size,0);
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
