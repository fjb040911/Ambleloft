const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {execFile}=require('node:child_process'),{promisify}=require('node:util');
const exec=promisify(execFile);
const {DockerService,helper,docker}=require('../core/ssh/docker.cjs');
const {validateEnvironment,sameTarget,targetSnapshot}=require('../core/ssh/environment.cjs');
const {validateRecord}=require('../core/workspace-state.cjs');
const {RemoteFiles}=require('../core/ssh/files.cjs');
const {createRemoteTools}=require('../core/ssh/agent-tools.cjs');
const environment={kind:'docker',endpoint:'unix:///var/run/docker.sock',daemonId:'engine-1',containerId:'a'.repeat(64),containerName:'development',imageId:'sha256:test',user:null,shell:'auto'};
const project={id:'p',name:'Dev',createdAt:'today',type:'ssh',connectionId:'connection',path:'/work',environment};
const result=value=>({stdout:Buffer.from(JSON.stringify(value)),stderr:Buffer.alloc(0),exitCode:0});
function mocked(){let state='running',daemonId='engine-1';const calls=[];const service=new DockerService({});service.run=async(id,endpoint,args)=>{calls.push(args);if(args[0]==='info')return result(daemonId);if(args[0]==='inspect')return result({id:environment.containerId,imageId:environment.imageId,name:'/development',state,workdir:'/workspace',mounts:[]});if(args[0]==='start'){state='running';return result('started');}throw Error('Unexpected Docker operation');};return {service,calls,state:value=>state=value,daemon:value=>daemonId=value};}
function localHelper(input){return new Promise((resolve,reject)=>{const child=execFile('python3',['-c',helper],{maxBuffer:48*1024*1024},(error,stdout,stderr)=>{try{const value=JSON.parse(stdout);if(value.error)reject(Error(value.error));else resolve(value.result);}catch(e){reject(error||e);}});child.stdin.end(JSON.stringify(input));});}
test('workspace validates structured targets, rejects injection and snapshots identity',()=>{
 validateRecord('project',project);assert.equal(sameTarget(project,{...project,environment:{...environment,containerName:'renamed'}}),true);
 for(const patch of [{containerId:'name; touch bad'},{endpoint:'tcp://another-host:2375'},{user:'root;id'},{shell:'bash -c command'},{password:'secret'}])assert.throws(()=>validateEnvironment({...environment,...patch}));
 assert.throws(()=>validateRecord('project',{...project,type:'local'}));const saved=targetSnapshot(project);assert.equal(sameTarget(saved,project),true);assert.equal(sameTarget(saved,{...project,environment:{...environment,containerId:'b'.repeat(64)}}),false);
 assert.match(docker(environment.endpoint),/env -u DOCKER_HOST -u DOCKER_CONTEXT docker --host/);
});
test('container selection is pinned to daemon and full ID; stopped containers require explicit start',async()=>{
 const {service,state,daemon,calls}=mocked();service.file=async(_id,_e,{op,root})=>op==='probe'?{shells:['sh'],uid:1000,home:'/home/dev'}:{path:root,writable:true};
 const ready=await service.enter('connection',environment);assert.equal(ready.shell,'sh');assert.equal(ready.path,'/workspace');assert.equal(calls.some(c=>c[0]==='start'),false);
 state('exited');await assert.rejects(service.enter('connection',environment),/exited/);await service.start('connection',environment);assert.equal(calls.filter(c=>c[0]==='start').length,1);
 state('paused');await assert.rejects(service.start('connection',environment),/仅支持/);daemon('other');await assert.rejects(service.enter('connection',environment),/服务已更换/);
});
test('helper handles UTF-8 names, binary bytes, concurrent changes and symlink boundaries',{skip:process.platform==='win32'?'Linux container helper requires POSIX filesystem semantics':false},async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'amble-container-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const name="中文 ' $(echo no)\nfile.txt";const write=await localHelper({op:'write',root,path:name,text:'hello',expectedSha256:null});assert.equal(write.bytes,5);
 const list=await localHelper({op:'list',root});assert.equal(list.entries[0].name,name);
 await assert.rejects(localHelper({op:'write',root,path:name,text:'bad',expectedSha256:null}),/变化/);
 await fs.writeFile(path.join(root,name),'changed');await assert.rejects(localHelper({op:'write',root,path:name,text:'bad',expectedSha256:write.sha256}),/变化/);
 await fs.symlink(os.tmpdir(),path.join(root,'outside'));await assert.rejects(localHelper({op:'bytes',root,path:'outside/anything'}),/之外/);
 await assert.rejects(localHelper({op:'bytes',root,path:'../anything'}),/目录中/);
 await fs.writeFile(path.join(root,'data.png'),Buffer.from([0,255,23,128]));assert.deepEqual(Buffer.from((await localHelper({op:'bytes',root,path:'data.png'})).data,'base64'),Buffer.from([0,255,23,128]));
 await assert.rejects(localHelper({op:'bytes',root,path:'data.png',limit:2}),/限制/);
});
test('container files use helper instead of host SFTP and isolate task and preview targets',{skip:process.platform==='win32'?'Linux container helper requires POSIX filesystem semantics':false},async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'amble-container-files-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 let current={...project,path:root};const runs=[{id:'r',projectId:'p',remote:targetSnapshot(current)}];
 const ssh={docker:{file:async(_id,_e,args)=>localHelper(args)},withSftp:()=>{throw Error('Must never access host files');},directory:async(_id,p)=>p};
 const files=new RemoteFiles({ssh,workspace:{read:async()=>({projects:[current]})},runs:()=>runs,directory:root});
 await files.write({projectId:'p',runId:'r',path:'test.md',text:'# Docker',expectedSha256:null});assert.equal((await files.read({projectId:'p',runId:'r',path:'test.md'})).text,'# Docker');
 const preview=await files.context({projectId:'p'});current={...current,environment:{...environment,containerId:'b'.repeat(64)}};
 await assert.rejects(files.read({projectId:'p',runId:'r',path:'test.md'}),/位置已改变/);
 assert.equal((await files.resource({url:preview.baseUrl+'test.md'})).status,404);
 assert.notEqual((await files.context({projectId:'p'})).baseUrl,preview.baseUrl);
});
test('remote tools route execution to selected container and refuse changed targets',async()=>{
 let current=project,received;const runtime={workspace:{read:async()=>({projects:[current]})},ssh:{execute:async(...args)=>{received=args;return {exitCode:0};}}};
 const tools=createRemoteTools(runtime,{run:{id:'r',permission:'full'}},project);
 await tools.call('remote_exec',{command:'pwd'},new AbortController().signal);assert.deepEqual(received[3].environment,environment);
 current={...project,environment:{...environment,user:'1001'}};await assert.rejects(tools.call('remote_exec',{command:'pwd'},new AbortController().signal),/配置已改变/);
});
test('missing Python is an actionable error, not an empty directory',async()=>{
 const {service}=mocked();service.raw=async()=>({stdout:Buffer.alloc(0),stderr:Buffer.from('python3 not found'),exitCode:127});await assert.rejects(service.file('connection',environment,{op:'list',root:'/work'}),/Python 3/);
});

const {EventEmitter}=require('node:events');
const {runChannel,openPty}=require('../core/ssh/channel.cjs');
function channelFixture(){const client=new EventEmitter(),stream=new EventEmitter();stream.stderr=new EventEmitter();stream.end=input=>{stream.input=input;};stream.close=()=>{stream.closed=true;};stream.signal=value=>{stream.lastSignal=value;};stream.setEncoding=()=>{};stream.write=value=>{stream.written=value;};stream.setWindow=(...args)=>{stream.size=args;};stream.pause=()=>{};stream.resume=()=>{};client.exec=(command,options,callback)=>{client.command=command;queueMicrotask(()=>(callback||options)(null,stream));};return {client,stream};}
test('SSH channels bound output, preserve binary data and never replay unknown outcomes',async()=>{
 const {client,stream}=channelFixture();let calls=0;const original=client.exec;client.exec=(...args)=>{calls++;original(...args);};
 const request=runChannel(client,'command',{input:'payload'});await new Promise(r=>setImmediate(r));stream.emit('data',Buffer.from([0,255]));stream.stderr.emit('data',Buffer.from('diagnostic'));stream.emit('exit',3);stream.emit('close');const r=await request;assert.deepEqual(r.stdout,Buffer.from([0,255]));assert.equal(r.exitCode,3);assert.equal(stream.input,'payload');assert.equal(client.listenerCount('close'),0);
 const unknown=runChannel(client,'command');await new Promise(r=>setImmediate(r));client.emit('close');await assert.rejects(unknown,/结果未知/);assert.equal(calls,2);
 const limited=runChannel(client,'command',{maxBytes:1});await new Promise(r=>setImmediate(r));stream.emit('data',Buffer.from('too much'));await assert.rejects(limited,/超过限制/);
});
test('SSH cancellation and PTY lifecycle preserve terminal input, resize and exit',async()=>{
 const {client,stream}=channelFixture(),controller=new AbortController();const pending=runChannel(client,'command',{signal:controller.signal});await new Promise(r=>setImmediate(r));controller.abort();await assert.rejects(pending,/已取消/);assert.equal(stream.lastSignal,'TERM');
 const pty=await openPty(client,'docker exec command',{cols:80,rows:24});pty.write('pwd\r');pty.resize(120,30);assert.equal(stream.written,'pwd\r');assert.deepEqual(stream.size,[30,120,0,0]);let count=0;const sub=pty.onExit(()=>count++);client.emit('close');stream.emit('close');assert.equal(count,1);sub.dispose();
});
test('container command and PTY construction use full ID, user, shell and workdir',async()=>{
 const {service}=mocked();service.enter=async()=>({shell:'sh'});service.directory=async()=>({path:"/workspace/a'b"});let command;
 service.raw=async(_id,cmd)=>{command=cmd;return {stdout:Buffer.from('ok'),stderr:Buffer.alloc(0),exitCode:0};};
 const env={...environment,user:'1000:1000'};await service.execute('connection','/workspace',"printf '%s' '$HOME'",{environment:env});assert.match(command,/'--user' '1000:1000'/);assert.ok(command.includes(environment.containerId));assert.match(command,/'\/bin\/sh' '-lc'/);assert.ok(command.includes("'--workdir' '/workspace/a'\\''b'"));
 const {client}=channelFixture();service.ssh={connected:async()=>client};await service.pty('connection','/workspace',{cols:80,rows:24},env);assert.ok(client.command.includes(environment.containerId));assert.ok(client.command.includes('1000:1000'));
});
test('container discovery uses explicit local sockets and returns full IDs',async()=>{
 const service=new DockerService({});const commands=[];service.raw=async(_id,command)=>{commands.push(command);return {stdout:Buffer.from('unix:///var/run/docker.sock\nunix:///run/user/1000/docker.sock\n'),stderr:Buffer.alloc(0),exitCode:0};};
 service.run=async(_id,endpoint,args)=>{commands.push([endpoint,...args]);if(endpoint==='unix:///var/run/docker.sock')throw Error('permission denied');if(args[0]==='info')return result('engine');return {stdout:Buffer.from(JSON.stringify({ID:'a'.repeat(64),Names:'dev',Image:'test',State:'running',Status:'Up'})+'\n'),exitCode:0};};
 const list=await service.list('connection');assert.equal(list.endpoint,'unix:///run/user/1000/docker.sock');assert.equal(list.containers[0].id.length,64);assert.equal(list.endpoints.length,2);assert.ok(commands.some(c=>Array.isArray(c)&&c.includes('--no-trunc')));
 await assert.rejects(service.list('connection','tcp://other-host'),/Unix socket/);
});
test('active project work blocks target changes but permits descriptive edits',async()=>{
 const {AgentRuntime}=require('../electron/agent-runtime.cjs');let mutations=0;
 const runtime={workspace:{read:async()=>({projects:[project]}),patch:async()=>{mutations++;}},contexts:new Map([['active',{run:{projectId:project.id}}]])};
 const patch=value=>AgentRuntime.prototype.patchWorkspace.call(runtime,{changes:[{kind:'project',action:'put',id:project.id,value}]});
 await assert.rejects(patch({...project,environment:{...environment,containerId:'b'.repeat(64)}}),/任务结束/);assert.equal(mutations,0);
 await patch({...project,description:'Updated explanation'});assert.equal(mutations,1);
});
