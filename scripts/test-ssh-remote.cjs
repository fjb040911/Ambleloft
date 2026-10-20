// Explicit live-server probe. Credentials are read from stdin, never from source or logs.
const {createInterface}=require('node:readline');
const {once}=require('node:events');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),http=require('node:http');
const assert=require('node:assert/strict');
const {SshService,quote}=require('../core/ssh/service.cjs');
const {RemoteFiles}=require('../core/ssh/files.cjs');
const {AgentRuntime}=require('../electron/agent-runtime.cjs');
(async()=>{
 const input=createInterface({input:process.stdin});const [line]=await once(input,'line');input.close();const credentials=JSON.parse(line);
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'amble-ssh-test-')),settings=new Map();
 const ssh=new SshService({database:{call:async(method,{key,value})=>{if(method==='readSetting')return settings.get(key);settings.set(key,value);}},encryption:{isEncryptionAvailable:()=>false},confirmHost:async info=>{assert.equal(info.fingerprint,credentials.fingerprint,'Unexpected server host key');console.log('Host fingerprint verified:',info.fingerprint);return true;}});
 let remoteTemp,runtime,server;let calls=0,modelInputs=[],names=[];
 try{
  const connection=await ssh.save({name:'Live validation',host:credentials.host,port:credentials.port||22,username:credentials.username,authType:'password',password:credentials.password});
  const project={id:'live-ssh',type:'ssh',connectionId:connection.id,name:'Remote validation',path:credentials.path,createdAt:new Date().toISOString()};
  const workspace={read:async()=>({projects:[project]})};const files=new RemoteFiles({ssh,workspace,runs:()=>runtime?.runs||[],directory});
  await ssh.connect(connection.id);assert.equal((await ssh.list())[0].state,'connected');
  const listing=await files.list({projectId:project.id,hidden:false});assert.ok(listing.entries.some(e=>e.name==='client'));
  const file=await files.read({projectId:project.id,path:'client/package.json'});assert.ok(file.text.includes('react'));assert.match(file.sha256,/^[a-f0-9]{64}$/);
  const command=await ssh.execute(connection.id,project.path,'printf OUT; printf ERR >&2; exit 37');assert.equal(command.stdout,'OUT');assert.equal(command.stderr,'ERR');assert.equal(command.exitCode,37);
  const node=await ssh.execute(connection.id,project.path,'node --version');assert.equal(node.exitCode,0);assert.match(node.stdout,/v\d+/);
  await assert.rejects(files.read({projectId:project.id,path:'../etc/passwd'}));
  remoteTemp=(await ssh.execute(connection.id,'/tmp','mktemp -d /tmp/amble-ssh-validation-XXXXXXXX')).stdout.trim();assert.match(remoteTemp,/^\/tmp\/amble-ssh-validation-[A-Za-z0-9]+$/);
  const temporary={...project,id:'temp',path:remoteTemp};const tempFiles=new RemoteFiles({ssh,workspace:{read:async()=>({projects:[temporary]})},runs:()=>[],directory});
  const write=await tempFiles.write({projectId:'temp',path:'中文 file.txt',text:'first\n',expectedSha256:null});assert.equal((await tempFiles.read({projectId:'temp',path:'中文 file.txt'})).text,'first\n');
  await assert.rejects(tempFiles.write({projectId:'temp',path:'中文 file.txt',text:'wrong',expectedSha256:'0'.repeat(64)}),/变化/);
  await tempFiles.write({projectId:'temp',path:'中文 file.txt',text:'second\n',expectedSha256:write.sha256});assert.equal((await tempFiles.read({projectId:'temp',path:'中文 file.txt'})).text,'second\n');
  await ssh.execute(connection.id,remoteTemp,'ln -s /etc outside');await assert.rejects(tempFiles.read({projectId:'temp',path:'outside/passwd'}),/之外/);
  const pty=await ssh.pty(connection.id,project.path,{cols:100,rows:30});let output='';const subscription=pty.onData(data=>output+=data);pty.write('unset HISTFILE; printf "PTY_%s\\n" OK\r');
  const until=Date.now()+10000;while(!output.includes('PTY_OK')&&Date.now()<until)await new Promise(r=>setTimeout(r,50));assert.ok(output.includes('PTY_OK'));pty.resize(120,40);pty.kill();subscription.dispose();
  server=http.createServer(async(req,res)=>{let raw='';for await(const chunk of req)raw+=chunk;const body=JSON.parse(raw);modelInputs.push(body);calls++;
   const all=(body.tools||[]).flatMap(tool=>tool.type==='namespace'?tool.tools.map(t=>({...t,namespace:tool.name})):[tool]);names=all.map(t=>t.name);
   const remote=all.find(t=>t.name.endsWith('remote_read'));
   let item;if(calls===1&&remote)item={type:'function_call',id:'fc_remote',call_id:'call_remote',name:remote.name,...(remote.namespace?{namespace:remote.namespace}:{}),arguments:JSON.stringify({path:'client/package.json'}),status:'completed'};
   else item={id:'msg_'+calls,type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:'Remote read verified',annotations:[]}]};
   const response={id:'resp_'+calls,object:'response',model:body.model,status:'completed',output:[item],usage:{input_tokens:1,output_tokens:1,total_tokens:2}};
   res.writeHead(200,{'content-type':'text/event-stream'});let n=0;const event=(type,fields)=>res.write('event: '+type+'\ndata: '+JSON.stringify({type,sequence_number:n++,...fields})+'\n\n');
   event('response.created',{response:{...response,status:'in_progress',output:[]}});event('response.output_item.added',{output_index:0,item:{...item,status:'in_progress'}});if(item.type==='function_call')event('response.function_call_arguments.done',{output_index:0,item_id:item.id,arguments:item.arguments});event('response.output_item.done',{output_index:0,item});event('response.completed',{response});res.end();
  });await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const config={baseUrl:`http://127.0.0.1:${server.address().port}/v1`,model:'fixture-model',apiKey:'',executable:''};
  runtime=new AgentRuntime({directory,workspace,provider:{secret:async()=>({...config})},publish:()=>{}});runtime.ssh=ssh;runtime.remoteFiles=files;await runtime.init();
  const run=await runtime.start({projectId:project.id,prompt:'Read client/package.json using the remote tools.'});
  const deadline=Date.now()+45000;while(Date.now()<deadline&&runtime.runs.find(r=>r.id===run.id)?.status!=='completed'&&runtime.runs.find(r=>r.id===run.id)?.status!=='failed')await new Promise(r=>setTimeout(r,100));
  const result=runtime.runs.find(r=>r.id===run.id);assert.equal(result.status,'completed',result.error);
  console.log('Advertised engine tools:',names.join(', '));assert.ok(names.some(n=>n.endsWith('remote_read')));assert.ok(!names.some(n=>['exec_command','shell_command','shell','apply_patch'].includes(n)),'SSH agent must not expose local execution or patch tools');
  assert.ok(calls>=2,'Real engine executed remote_read');assert.ok(JSON.stringify(modelInputs.at(-1)).includes('react'),'Remote file content returned to the local model');assert.ok(!JSON.stringify(modelInputs).includes(credentials.password));
  assert.equal(result.remote.path,project.path);assert.notEqual(result.cwd,project.path);
  console.log('PASS: SSH/SFTP, host key, login environment, PTY, confined read/write and conflict checks, real local Codex engine calling remote tools without credential exposure.');
 }finally{
  await runtime?.shutdown();if(remoteTemp){const id=(await ssh.list())[0]?.id;if(id)await ssh.execute(id,'/tmp','rm -rf -- '+quote(remoteTemp)).catch(e=>console.error('Temporary remote directory cleanup failed:',remoteTemp,e.message));}
  ssh.shutdown();server?.closeAllConnections();if(server)await new Promise(r=>server.close(r));await fs.rm(directory,{recursive:true,force:true});
 }
})().catch(e=>{console.error(e.message);process.exitCode=1;});
