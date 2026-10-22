const {sameTarget,targetLabel}=require('./environment.cjs');
const {randomUUID}=require('node:crypto');
const schema=properties=>({type:'object',properties,additionalProperties:false});
const tools=[
 {name:'remote_list',description:'List files in the SSH project directory. Paths are project-relative.',inputSchema:schema({path:{type:'string'},hidden:{type:'boolean'}})},
 {name:'remote_search',description:'Search file names in the SSH project. Use remote_exec for content searches.',inputSchema:{...schema({query:{type:'string'}}),required:['query']}},
 {name:'remote_read',description:'Read a UTF-8 remote project file. Returns text and SHA-256 for safe subsequent writes.',inputSchema:{...schema({path:{type:'string'}}),required:['path']}},
 {name:'remote_write',description:'Write a remote UTF-8 project file. expectedSha256 must match remote_read, or be null for a new file. Host approval applies.',inputSchema:{...schema({path:{type:'string'},text:{type:'string'},expectedSha256:{type:['string','null']}}),required:['path','text','expectedSha256']}},
 {name:'remote_exec',description:'Execute a command on the SSH server in a login bash shell in the project directory. Returns stdout, stderr and exit code. Host approval applies. Commands have a 120 second limit; never retry an unknown outcome automatically.',inputSchema:{...schema({command:{type:'string'},timeoutMs:{type:'integer',minimum:1000,maximum:120000}}),required:['command']}},
];
function createRemoteTools(runtime,context,project){
 const validate=async()=>{if(context.done||context.cancelled)throw Error('任务已停止');const current=(await runtime.workspace.read()).projects.find(p=>p.id===project.id);if(!current||current.type!=='ssh'||!sameTarget(current,project))throw Error('远端项目配置已改变，请重新开始任务');};
 async function approve(name,args,signal){
  if(context.run.permission==='full')return;
  if(signal.aborted)throw Error('操作已取消');
  const profile=(await runtime.ssh.list()).find(p=>p.id===project.connectionId),id='ssh-'+randomUUID();
  if(signal.aborted||context.done||context.cancelled)throw Error('操作已取消');
  await new Promise((resolve,reject)=>{
   context.remoteApprovals??=new Map();
   const abort=()=>finish(false);
   const finish=accepted=>{context.remoteApprovals.delete(id);signal.removeEventListener('abort',abort);context.run.approvals=context.run.approvals.filter(a=>a.id!==id);if(!context.done){context.run.status=context.run.approvals.length?'waiting':'running';runtime.changed(context.run);}accepted?resolve():reject(Error('远端操作未获批准或已取消'));};
   context.remoteApprovals.set(id,finish);signal.addEventListener('abort',abort,{once:true});
   context.run.approvals.push({id,rpcId:id,method:name==='remote_write'?'ssh/fileChange/requestApproval':'ssh/commandExecution/requestApproval',detail:JSON.stringify({reason:`远端 SSH：${profile?.username}@${profile?.host}:${profile?.port}`,cwd:targetLabel(project),environment:project.environment,...(name==='remote_exec'?{command:args.command}:{path:args.path,text:args.text,expectedSha256:args.expectedSha256})})});context.run.status='waiting';runtime.changed(context.run);
  });
 }
 return {tools:tools.map(tool=>({...tool,description:tool.description.replaceAll('SSH project','selected remote environment project').replace('on the SSH server in a login bash shell',project.environment?.kind==='docker'?'inside the selected Docker container using its configured bash/sh shell':'on the SSH server in a login bash shell')})),async call(name,args,signal){await validate();if(signal.aborted)throw Error('操作已取消');const tool=tools.find(t=>t.name===name);if(!tool||!args||typeof args!=='object'||Object.keys(args).some(k=>!Object.keys(tool.inputSchema.properties).includes(k)))throw Error('远端工具参数无效');
  if(name==='remote_write'||name==='remote_exec')await approve(name,args,signal);
  await validate();if(signal.aborted)throw Error('操作已取消');
  if(name==='remote_exec')return runtime.ssh.execute(project.connectionId,project.path,args.command,{signal,timeoutMs:args.timeoutMs,environment:project.environment});
  return runtime.remoteFiles[{remote_list:'list',remote_read:'read',remote_write:'write',remote_search:'search'}[name]]({...args,projectId:project.id,runId:context.run.id,signal});
 }};
}
module.exports={createRemoteTools,tools};
