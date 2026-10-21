const fs=require('node:fs');
const path=require('node:path');
const {validateEnvironment}=require('./environment.cjs');
const {runChannel,openPty}=require('./channel.cjs');
const quote=value=>"'"+String(value).replace(/'/g,"'\\''")+"'";
const helper=fs.readFileSync(path.join(__dirname,'container-files.py'),'utf8');
const format='{"id":{{json .Id}},"name":{{json .Name}},"imageId":{{json .Image}},"image":{{json .Config.Image}},"user":{{json .Config.User}},"workdir":{{json .Config.WorkingDir}},"state":{{json .State.Status}},"mounts":{{json .Mounts}}}';
function endpointValid(endpoint){if(typeof endpoint!=='string'||!/^unix:\/\/\/[^\0\r\n]{1,400}$/.test(endpoint))throw Error('请选择 SSH 服务器本机的 Docker Unix socket');return endpoint;}
const docker=endpoint=>'env -u DOCKER_HOST -u DOCKER_CONTEXT docker --host '+quote(endpointValid(endpoint));
function parse(result){try{return JSON.parse(result.stdout.toString());}catch{throw Error('Docker 返回的数据无效');}}
class DockerService{
 constructor(ssh){this.ssh=ssh;}
 async raw(id,command,options){return runChannel(await this.ssh.connected(id),'bash -lc '+quote(command),options);}
 async run(id,endpoint,args,options){const r=await this.raw(id,docker(endpoint)+' '+args.map(quote).join(' '),options);if(r.exitCode!==0)throw Error('Docker 操作失败：'+r.stderr.toString().slice(0,1200));return r;}
 async daemon(id,endpoint){const value=parse(await this.run(id,endpoint,['info','--format','{{json .ID}}']));if(typeof value!=='string'||!value)throw Error('无法验证 Docker 服务身份');return value;}
 async list(id,endpoint){
  let endpoints=[];
  if(endpoint)endpoints=[endpointValid(endpoint)];else{
   const probe=await this.raw(id,'command -v docker >/dev/null || { echo "未找到 Docker CLI" >&2; exit 1; }; for p in /var/run/docker.sock "${XDG_RUNTIME_DIR:-/run/user/$(id -u)}/docker.sock"; do if [ -S "$p" ]; then printf "unix://%s\\n" "$p"; fi; done');
   if(probe.exitCode!==0)throw Error(probe.stderr.toString().trim());endpoints=[...new Set(probe.stdout.toString().trim().split('\n').filter(Boolean))];
   if(!endpoints.length)throw Error('未发现本机 Docker socket；请在高级设置输入本机 Unix socket。远端 Docker context 暂不支持');
  }
  let lastError;for(const candidate of endpoints){try{
   const daemonId=await this.daemon(id,candidate),r=await this.run(id,candidate,['ps','-a','--no-trunc','--format','{{json .}}']);
   const containers=r.stdout.toString().trim().split('\n').filter(Boolean).map(line=>{const c=JSON.parse(line);return {id:c.ID,name:c.Names,image:c.Image,state:c.State,status:c.Status};});
   return {endpoint:candidate,endpoints,daemonId,containers};
  }catch(e){lastError=e;}}
  throw lastError||Error('无法访问 Docker 服务');
 }
 async inspect(id,e,{running=true}={}){
  validateEnvironment(e);if(await this.daemon(id,e.endpoint)!==e.daemonId)throw Error('Docker 服务已更换，请重新选择容器');
  let c;try{const value=parse(await this.run(id,e.endpoint,['inspect','--type','container','--format',format,e.containerId]));c=value;}catch(error){throw Error('无法访问原容器，请刷新容器列表；同名重建需重新绑定。'+error.message);}
  if(c.id!==e.containerId||e.imageId&&c.imageId!==e.imageId)throw Error('容器身份已改变，请重新选择容器');
  if(running&&c.state!=='running')throw Error('容器当前状态：'+c.state+'；请在项目设置中处理');
  return c;
 }
 args(e,{tty=false,workdir}={}){return ['exec','-i',...(tty?['-t']:[]),...(e.user?['--user',e.user]:[]),...(workdir?['--workdir',workdir]:[]),e.containerId];}
 async file(id,e,input,{checked=false,signal}={}){
  validateEnvironment(e);if(!checked)await this.inspect(id,e);
  const r=await this.raw(id,docker(e.endpoint)+' '+[...this.args(e,{workdir:'/'}), 'python3','-c',helper].map(quote).join(' '),{input:JSON.stringify(input),signal,maxBytes:46*1024*1024,timeoutMs:30000});
  let value;try{value=JSON.parse(r.stdout.toString());}catch{throw Error('容器文件访问需要 Python 3；请检查容器依赖和当前用户权限。'+r.stderr.toString().slice(0,500));}
  if(value.error)throw Error(value.error);if(r.exitCode!==0||!Object.hasOwn(value,'result'))throw Error('容器文件操作失败');return value.result;
 }
 async enter(id,e){
  const c=await this.inspect(id,e);e={...e,containerName:c.name.replace(/^\//,''),imageId:c.imageId};
  const probe=await this.file(id,e,{op:'probe'},{checked:true});const shell=e.shell==='auto'?(probe.shells.includes('bash')?'bash':'sh'):e.shell;
  if(!probe.shells.includes(shell))throw Error('容器没有可用的所选 Shell（需要 /bin/bash 或 /bin/sh）');
  let directory;for(const candidate of [...new Set([c.workdir,probe.home,'/'].filter(Boolean))]){try{directory=await this.file(id,e,{op:'directory',root:candidate},{checked:true});break;}catch{}}
  if(!directory)throw Error('当前容器用户没有可访问的目录');
  return {environment:e,uid:probe.uid,shell,shells:probe.shells,...directory};
 }
 async start(id,e){const c=await this.inspect(id,e,{running:false});if(!['exited','created'].includes(c.state))throw Error('仅支持启动已停止的容器');await this.run(id,e.endpoint,['start',e.containerId]);return this.enter(id,e);}
 async directory(id,p,e){const c=await this.inspect(id,e);const dir=await this.file(id,e,{op:'directory',root:p},{checked:true});const mount=(c.mounts||[]).filter(m=>dir.path===m.Destination||dir.path.startsWith(m.Destination.replace(/\/$/,'')+'/')).sort((a,b)=>b.Destination.length-a.Destination.length)[0];return {...dir,storage:mount?.Type||'container'};}
 async browse(id,p,e){const d=await this.directory(id,p,e);const list=await this.file(id,e,{op:'list',root:d.path});return {...d,parent:path.posix.dirname(d.path),entries:list.entries.filter(x=>x.directory).map(x=>({name:x.name,path:path.posix.join(d.path,x.path)})),truncated:list.truncated};}
 async execute(id,root,command,{environment:e,signal,timeoutMs}={}){
  if(typeof command!=='string'||!command.trim()||command.includes('\0')||command.length>32000)throw Error('远端命令无效');
  const ready=await this.enter(id,e);const d=await this.directory(id,root,e);if(signal?.aborted)throw Error('操作已取消');
  const args=[...this.args(e,{workdir:d.path}),'/bin/'+ready.shell,'-lc',command];
  const r=await this.raw(id,docker(e.endpoint)+' '+args.map(quote).join(' '),{signal,timeoutMs:timeoutMs||120000,maxBytes:524288});return {stdout:r.stdout.toString(),stderr:r.stderr.toString(),exitCode:r.exitCode,cwd:d.path,truncated:false};
 }
 async pty(id,root,size,e){const ready=await this.enter(id,e),d=await this.directory(id,root,e);return openPty(await this.ssh.connected(id),'bash -lc '+quote('exec '+docker(e.endpoint)+' '+[...this.args(e,{tty:true,workdir:d.path}),'/bin/'+ready.shell,'-l'].map(quote).join(' ')),size);}
}
module.exports={DockerService,endpointValid,docker,helper};
