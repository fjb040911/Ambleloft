const {validateEnvironment}=require('./environment.cjs');
const fs=require('node:fs/promises');
const path=require('node:path').posix;
const {randomUUID,createHash}=require('node:crypto');
const {Client}=require('ssh2');
const quote=value=>"'"+String(value).replace(/'/g,"'\\''")+"'";
const sha=data=>createHash('sha256').update(data).digest('hex');
const inside=(root,file)=>file===root||file.startsWith(root==='/'?'/':root+'/');
function validateConnection(value){
 if(!value||typeof value.host!=='string'||!value.host.trim()||value.host.length>253||/[\s\0/]/.test(value.host)||typeof value.username!=='string'||!value.username.trim()||value.username.length>128||/[\r\n\0]/.test(value.username)||!Number.isInteger(value.port)||value.port<1||value.port>65535||!['password','key','agent'].includes(value.authType))throw Error('SSH 连接信息无效');
 if(value.authType==='key'&&(!value.privateKeyPath||typeof value.privateKeyPath!=='string'))throw Error('请选择 SSH 私钥');
 return {id:value.id||randomUUID(),name:String(value.name||value.host).slice(0,120),host:value.host.trim(),port:value.port,username:value.username.trim(),authType:value.authType,...(value.authType==='key'?{privateKeyPath:value.privateKeyPath}:{})};
}
class SshService{
 constructor({database,encryption,publish=()=>{},confirmHost=async()=>false,clientFactory=()=>new Client()}){Object.assign(this,{database,encryption,publish,confirmHost,clientFactory});this.clients=new Map();this.opening=new Map();this.pending=new Map();this.secrets=new Map();this.states=new Map();this.timers=new Map();this.attempts=new Map();this.stopped=new Set();this.queue=Promise.resolve();this.closed=false;this.docker=new (require('./docker.cjs').DockerService)(this);}
 async records(){return await this.database.call('readSetting',{key:'sshConnections'})||[];}
 async mutate(fn){const result=this.queue.then(async()=>{const records=await this.records();const value=await fn(records);await this.database.call('writeSetting',{key:'sshConnections',value:records});return value;});this.queue=result.catch(()=>{});return result;}
 state(id,state,error=''){this.states.set(id,{state,error});this.publish();}
 async list(){return (await this.records()).map(({secret,...p})=>({...p,remember:!!secret,...(this.states.get(p.id)||{state:'disconnected',error:''})}));}
 async save(input){const p=validateConnection(input);if(this.pending.has(p.id))throw Error('连接正在建立，请稍后修改');if(typeof p.id!=='string'||p.id.length>120)throw Error('连接 ID 无效');
  const secret={password:typeof input.password==='string'?input.password:'',passphrase:typeof input.passphrase==='string'?input.passphrase:''};
  if(p.authType==='password'&&!secret.password)throw Error('请填写 SSH 密码');
  if(secret.password.length>4096||secret.passphrase.length>4096)throw Error('凭据过长');
  let persisted;
  if(input.remember){if(!this.encryption.isEncryptionAvailable())throw Error('系统安全存储不可用，请取消“记住凭据”后重试');persisted=this.encryption.encryptString(JSON.stringify(secret)).toString('base64');}
  await this.mutate(records=>{const i=records.findIndex(c=>c.id===p.id);if(i<0&&records.length>=100)throw Error('SSH 连接数量达到上限');if(i>=0)records[i]={...p,secret:persisted};else records.push({...p,secret:persisted});});
  this.disconnect(p.id);this.secrets.set(p.id,secret);this.state(p.id,'disconnected');return p;
 }
 async connect(id,{manual=true}={}){
  if(this.closed)throw Error('SSH 服务已关闭');
  if(manual){this.stopped.delete(id);clearTimeout(this.timers.get(id));this.attempts.set(id,0);}
  else if(this.stopped.has(id))throw Error('SSH 已断开，请手动连接');
  if(this.clients.has(id))return this.clients.get(id);
  if(this.pending.has(id))return this.pending.get(id);
  const operation=this.open(id);this.pending.set(id,operation);
  try{return await operation;}catch(error){if(!this.stopped.has(id)&&!['authentication','untrusted','error'].includes(this.states.get(id)?.state))this.state(id,'error','SSH 连接失败，请检查连接配置');throw error;}finally{if(this.pending.get(id)===operation)this.pending.delete(id);}
 }
 async open(id){
  const record=(await this.records()).find(p=>p.id===id);if(!record)throw Error('SSH 连接不存在');
  let secret=this.secrets.get(id);
  if(!secret&&record.secret){try{secret=JSON.parse(this.encryption.decryptString(Buffer.from(record.secret,'base64')));}catch{throw Error('无法解密 SSH 凭据，请重新填写');}}
  if(record.authType==='password'&&!secret?.password){this.state(id,'authentication','请在项目设置中填写 SSH 密码');throw Error('请在项目设置中填写 SSH 密码');}
  const config={host:record.host,port:record.port,username:record.username,readyTimeout:15000,keepaliveInterval:15000,keepaliveCountMax:3,tryKeyboard:true};
  if(record.authType==='password')config.password=secret.password;
  if(record.authType==='key'){config.privateKey=await fs.readFile(record.privateKeyPath);config.passphrase=secret?.passphrase;}
  if(record.authType==='agent'){if(!process.env.SSH_AUTH_SOCK)throw Error('本机 SSH Agent 不可用');config.agent=process.env.SSH_AUTH_SOCK;}
  let trustError='';config.hostVerifier=(key,callback)=>{void(async()=>{try{
   const fingerprint='SHA256:'+createHash('sha256').update(key).digest('base64').replace(/=+$/,'');
   const hostKey=JSON.stringify([record.host,record.port]);
   const known=await this.database.call('readSetting',{key:'sshHost:'+hostKey});
   if(known&&known!==fingerprint){trustError='服务器指纹发生变化，连接已阻止';callback(false);return;}
   if(!known){if(!await this.confirmHost({...record,secret:undefined,fingerprint})){trustError='未信任服务器指纹';callback(false);return;}await this.database.call('writeSetting',{key:'sshHost:'+hostKey,value:fingerprint});}
   callback(true);
  }catch{trustError='无法验证服务器指纹';callback(false);}})();};
  if(this.closed||this.stopped.has(id))throw Error('SSH 连接已取消');
  this.state(id,'connecting');const client=this.clientFactory();this.opening.set(id,client);let ready=false;
  const pending=new Promise((resolve,reject)=>{
   client.on('keyboard-interactive',(_name,_instructions,_lang,prompts,finish)=>{finish(record.authType==='password'&&prompts.length===1?[secret.password]:[]);});
   client.once('ready',()=>{if(this.closed||this.stopped.has(id)){client.end();reject(Error('SSH 连接已取消'));return;}ready=true;this.clients.set(id,client);this.attempts.set(id,0);this.state(id,'connected');resolve(client);});
   client.on('error',error=>{if(this.closed||this.stopped.has(id)||this.opening.get(id)!==client){if(!ready)reject(Error('SSH 连接已取消'));return;}const reason=trustError||(error.level==='client-authentication'?'SSH 认证失败，请检查凭据':`SSH 连接失败：${error.code||'连接中断'}`);this.state(id,trustError?'untrusted':error.level==='client-authentication'?'authentication':'error',reason);if(!ready){if(trustError||error.level==='client-authentication')this.stopped.add(id);reject(Error(reason));}});
   client.on('close',()=>{if(this.opening.get(id)!==client&&this.clients.get(id)!==client){if(!ready)reject(Error('SSH 连接已关闭'));return;}if(this.opening.get(id)===client)this.opening.delete(id);if(this.clients.get(id)===client)this.clients.delete(id);if(!ready){if(!this.stopped.has(id)&&this.states.get(id)?.state==='connecting')this.state(id,'error','SSH 连接已关闭');reject(Error(trustError||'SSH 连接已关闭'));}else if(!this.stopped.has(id)&&!this.closed){this.state(id,'reconnecting','连接中断；执行中的命令不会自动重跑');this.retry(id);}else this.state(id,'disconnected');});
   client.connect(config);
  });
  return pending;
 }
 retry(id){const n=(this.attempts.get(id)||0)+1;this.attempts.set(id,n);if(n>5){this.state(id,'error','重连失败，请手动连接');return;}const timer=setTimeout(()=>{if(this.stopped.has(id)||this.closed)return;void this.connect(id,{manual:false}).catch(()=>{if(!this.stopped.has(id)&&!this.closed)this.retry(id);});},Math.min(30000,1000*2**(n-1)));timer.unref?.();this.timers.set(id,timer);}
 disconnect(id){this.stopped.add(id);clearTimeout(this.timers.get(id));this.opening.get(id)?.end();this.clients.get(id)?.end();this.clients.delete(id);this.state(id,'disconnected');}
 async connected(id){if(this.closed)throw Error('SSH 服务已关闭');if(this.stopped.has(id))throw Error('SSH 已断开，请手动连接');if(this.clients.has(id))return this.clients.get(id);if(this.pending.has(id))return this.pending.get(id);throw Error('SSH 未连接，请先连接服务器');}
 async sftp(id){const client=await this.connected(id);return new Promise((resolve,reject)=>client.sftp((e,s)=>e?reject(Error('SFTP 不可用')):resolve(s)));}
 async withSftp(id,fn){const s=await this.sftp(id);let timer;try{return await Promise.race([fn(s),new Promise((_,reject)=>{timer=setTimeout(()=>{s.end();reject(Error('SFTP 操作超时'));},30000);})]);}finally{clearTimeout(timer);s.end();}}
 async directory(id,requested,environment){validateEnvironment(environment);if(environment?.kind==='docker')return (await this.docker.directory(id,requested,environment)).path;return this.withSftp(id,async s=>{const root=await call(s,'realpath',requested||'.'),stat=await call(s,'stat',root);if(!stat.isDirectory())throw Error('远端路径不是目录');return root;});}
 async browse(id,directory,environment){validateEnvironment(environment);if(environment?.kind==='docker')return this.docker.browse(id,directory,environment);return this.withSftp(id,async s=>{const root=await call(s,'realpath',directory||'.');const entries=await call(s,'readdir',root);return {path:root,parent:path.dirname(root),entries:entries.filter(e=>e.attrs.isDirectory()&&!['.','..'].includes(e.filename)).slice(0,1000).map(e=>({name:e.filename,path:path.join(root,e.filename)})).sort((a,b)=>a.name.localeCompare(b.name))};});}
 async resolve(s,root,relative='',newFile=false){
  if(typeof relative!=='string'||relative.includes('\0')||relative.includes('\\')||path.isAbsolute(relative)||relative.split('/').includes('..'))throw Error('远端路径必须位于项目目录中');
  const canonical=await call(s,'realpath',root),requested=path.join(canonical,relative);
  const full=newFile?path.join(await call(s,'realpath',path.dirname(requested)),path.basename(requested)):await call(s,'realpath',requested);
  if(!inside(canonical,full))throw Error('不能访问远端项目目录之外的文件');return {root:canonical,full,relative:path.relative(canonical,full)};
 }
 async execute(id,root,command,{signal,timeoutMs=120000,environment}={}){
  validateEnvironment(environment);if(environment?.kind==='docker')return this.docker.execute(id,root,command,{signal,timeoutMs,environment});
  if(typeof command!=='string'||!command.trim()||command.length>32000||command.includes('\0'))throw Error('远端命令无效');
  const client=await this.connected(id);const cwd=await this.directory(id,root);
  if(signal?.aborted)throw Error('操作已取消');
  return new Promise((resolve,reject)=>{let channel,timer,settled=false;const chunks=[],errors=[];let bytes=0,truncated=false,exitCode=null,exitSignal=null;
   const finish=(error,result)=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',cancel);client.removeListener('close',lost);error?reject(error):resolve(result);};
   const stop=()=>{try{channel?.signal('TERM');}catch{}try{channel?.close();}catch{}};
   const cancel=()=>{stop();finish(Error('远端命令已取消；请核实是否仍有子进程运行'));};
   const lost=()=>finish(Error('SSH 已断开，命令结果未知；请核实后再执行，不会自动重跑'));
   const collect=target=>data=>{bytes+=data.length;if(bytes<=524288)target.push(Buffer.from(data));else truncated=true;};
   signal?.addEventListener('abort',cancel,{once:true});client.once('close',lost);
   timer=setTimeout(()=>{stop();finish(Error('远端命令超时；执行结果未知，请检查远端状态'));},Math.max(1000,Math.min(timeoutMs,120000)));
   client.exec('bash -lc '+quote('cd -- '+quote(cwd)+' || exit; '+command),(error,stream)=>{if(error){finish(Error('无法打开 SSH 命令通道'));return;}channel=stream;if(settled){stream.close();return;}stream.on('data',collect(chunks));stream.stderr.on('data',collect(errors));stream.on('exit',(code,sig)=>{exitCode=code;exitSignal=sig;});stream.on('error',()=>finish(Error('SSH 命令通道中断，结果未知')));stream.on('close',()=>{if(exitCode===null&&!exitSignal){lost();return;}finish(null,{stdout:Buffer.concat(chunks).toString('utf8'),stderr:Buffer.concat(errors).toString('utf8'),exitCode,signal:exitSignal,truncated,cwd});});});
  });
 }
 async pty(id,root,{cols,rows},environment){
  validateEnvironment(environment);if(environment?.kind==='docker')return this.docker.pty(id,root,{cols,rows},environment);
  const client=await this.connected(id),cwd=await this.directory(id,root);
  return new Promise((resolve,reject)=>client.exec('cd -- '+quote(cwd)+' && exec bash -l',{pty:{term:'xterm-256color',cols,rows}},(error,stream)=>{
   if(error){reject(Error('无法创建远端终端'));return;}stream.setEncoding('utf8');stream.on('error',()=>stream.close());let exited=false;
   resolve({write:data=>stream.write(data),resize:(cols,rows)=>stream.setWindow(rows,cols,0,0),pause:()=>stream.pause(),resume:()=>stream.resume(),kill:()=>{stream.signal('HUP');stream.close();},onData:fn=>{stream.on('data',fn);return {dispose:()=>stream.removeListener('data',fn)};},onExit:fn=>{const done=(code)=>{if(!exited){exited=true;fn({exitCode:Number.isInteger(code)?code:255});}};stream.once('close',done);client.once('close',done);return {dispose:()=>{stream.removeListener('close',done);client.removeListener('close',done);}};}});
  }));
 }
 shutdown(){this.closed=true;for(const id of this.timers.keys())clearTimeout(this.timers.get(id));for(const id of new Set([...this.clients.keys(),...this.opening.keys()]))this.disconnect(id);this.secrets.clear();}
}
function call(s,method,...args){return new Promise((resolve,reject)=>s[method](...args,(error,value)=>error?reject(error):resolve(value)));}
async function readBytes(s,file,limit=1048576){const stat=await call(s,'stat',file);if(!stat.isFile())throw Error('仅支持普通文件');if(stat.size>limit)throw Error('远端文件超过读取大小限制');const handle=await call(s,'open',file,'r');try{const buffer=Buffer.alloc(stat.size);let offset=0;while(offset<buffer.length){const n=await new Promise((resolve,reject)=>s.read(handle,buffer,offset,buffer.length-offset,offset,(e,n)=>e?reject(e):resolve(n)));if(!n)break;offset+=n;}return {data:buffer.subarray(0,offset),stat};}finally{await call(s,'close',handle);}}
module.exports={SshService,call,readBytes,quote,sha,inside,validateConnection};
