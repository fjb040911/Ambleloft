const fs=require('node:fs');
const path=require('node:path');
const {createHash}=require('node:crypto');
const {hash,key}=require('./sources.cjs');
const LIMITS=Object.freeze({files:4,fileBytes:64*1024,totalBytes:256*1024,chars:4000,lines:80,candidates:100});
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const fail=code=>{throw Object.assign(Error(code),{code});};
function relativePath(value){if(typeof value!=='string'||!value||value.length>512||value.includes('\\')||/[\x00-\x1f\x7f]/.test(value)||path.isAbsolute(value)||/^[a-z]:/i.test(value)||value.split('/').some(p=>!p||p==='.'||p==='..'))fail('PATH_OUTSIDE');return value;}
function sensitive(name){return name.split('/').some(p=>/^(\.git|\.ssh|\.aws|\.config|node_modules|vendor|dist|build|coverage|\.env(?:\..*)?|credentials?(?:\..*)?|secrets?(?:\..*)?|id_rsa|id_ed25519)$/i.test(p))||/\.(pem|key|p12|pfx|keystore|sqlite|db)$/i.test(name);}
const signature=s=>[s.dev,s.ino,s.size,s.mtimeNs,s.ctimeNs,s.mode,s.nlink].map(String).join(':');
function chain(root,name){const paths=[root];for(const part of name.split('/'))paths.push(path.join(paths.at(-1),part));return paths.map((p,index)=>{const stat=fs.lstatSync(p,{bigint:true});if(stat.isSymbolicLink())fail('SYMLINK');if(index<paths.length-1&&!stat.isDirectory())fail('PATH_OUTSIDE');if(index===paths.length-1&&(!stat.isFile()||stat.nlink!==1n))fail('NOT_REGULAR');return {path:p,stat};});}
// Only immutable descriptors supply bytes. Recheck the entire path and descriptor before and after reading.
function readFile(root,name,{limits=LIMITS,hook=()=>{}}={}){
 if(typeof fs.constants.O_NOFOLLOW!=='number')fail('UNSUPPORTED');relativePath(name);if(sensitive(name))fail('SENSITIVE');
 const realRoot=fs.realpathSync(root);if(realRoot!==path.resolve(root))fail('ROOT_CHANGED');
 const initial=chain(realRoot,name),target=initial.at(-1);if(target.stat.size>BigInt(limits.fileBytes))fail('TOO_LARGE');
 hook('beforeOpen');let fd;
 const verify=()=>{const now=chain(realRoot,name);if(now.some((v,i)=>signature(v.stat)!==signature(initial[i].stat)))fail('READ_RACE');if(fs.realpathSync(root)!==realRoot||fs.realpathSync(target.path)!==target.path)fail('READ_RACE');if(signature(fs.fstatSync(fd,{bigint:true}))!==signature(target.stat))fail('READ_RACE');};
 try{fd=fs.openSync(target.path,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK);verify();hook('beforeRead');verify();const bytes=Buffer.alloc(Number(target.stat.size)+1);let count=0,n;while(count<bytes.length&&(n=fs.readSync(fd,bytes,count,bytes.length-count,count))>0)count+=n;if(count!==Number(target.stat.size))fail('READ_RACE');hook('afterRead');verify();const second=Buffer.alloc(count+1);let length=0;while(length<second.length&&(n=fs.readSync(fd,second,length,second.length-length,length))>0)length+=n;if(length!==count||!bytes.subarray(0,count).equals(second.subarray(0,length)))fail('READ_RACE');verify();
  const data=bytes.subarray(0,count);if(data.includes(0))fail('BINARY');let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(data);}catch{fail('BINARY');}
  // Reject whole files rather than retaining a partially redacted prompt with unknown credentials.
  if(/-----BEGIN [A-Z ]*PRIVATE KEY-----|(?:api[_-]?key|access[_-]?token|password|secret)\s*[:=]\s*["']?[^\s"']{8,}/i.test(text))fail('SENSITIVE');
  return {text,contentHash:digest(data),bytes:count,root:realRoot,rootIdentity:[initial[0].stat.dev,initial[0].stat.ino].map(String).join(':')};
 }finally{if(fd!==undefined)fs.closeSync(fd);}
}
const reasons={UNSUPPORTED:'当前平台无法保证不跟随符号链接，未读取文件',PATH_OUTSIDE:'路径不在允许范围内',SYMLINK:'不读取符号链接',ROOT_CHANGED:'项目根目录已变化',NOT_REGULAR:'不是独立普通文件',TOO_LARGE:'文件超过 64 KiB 读取上限',READ_RACE:'读取期间文件或路径发生变化',BINARY:'不是 UTF-8 文本文件',SENSITIVE:'敏感文件或疑似凭据，未提供',ENOENT:'文件已不存在',EACCES:'文件不可读取'};
function candidates(run){const seen=new Set(),out=[];for(const batch of [...(run.fileChanges||[])].reverse())for(const change of batch.files||[]){if(out.length>=LIMITS.candidates)return out;if(typeof change.path!=='string'||seen.has(change.path))continue;seen.add(change.path);out.push({change,turnKey:batch.turnKey,partial:!!batch.notice});}return out;}
function captureFiles(run,project,excluded=[],question='',options={}){
 const items=[],omissions=[],list=candidates(run);if(!list.length)return {items,omissions};
 if(!project||project.type==='ssh'||run.remote||!project.path||!run.cwd){return {items,omissions:[{kind:'file-excerpt',reason:'缺少可核验的本地项目工作目录，未读取文件'}]};}
 let root;try{root=fs.realpathSync(project.path);if(fs.realpathSync(run.cwd)!==root)fail('ROOT_CHANGED');}catch{return {items,omissions:[{kind:'file-excerpt',reason:'任务目录与登记项目不匹配，未读取文件'}]};}
 const sorted=list.sort((a,b)=>Number(question.includes(b.change.path))-Number(question.includes(a.change.path)));let count=0,bytes=0;
 for(const {change,turnKey,partial} of sorted){let name;try{name=relativePath(change.path);}catch{omissions.push({kind:'file-excerpt',reason:reasons.PATH_OUTSIDE});continue;}
  const sourceKey=key('task-file',run.id,name);if(excluded.includes(sourceKey))continue;
  if(count>=LIMITS.files){omissions.push({kind:'file-excerpt',reason:'最多读取四个相关文件，其余未提供'});break;}count++;
  try{const file=readFile(root,name,options);if(bytes+file.bytes>LIMITS.totalBytes)fail('TOO_LARGE');bytes+=file.bytes;
   const lines=file.text.split('\n'),hint=change.hunks?.[0]?.newStart,start=Number.isSafeInteger(hint)&&hint>0?Math.min(lines.length,Math.max(1,hint-3)):1;
   const excerpt=lines.slice(start-1,start-1+LIMITS.lines).join('\n').slice(0,LIMITS.chars),end=start+excerpt.split('\n').length-1;
   const recorded={turnKey:turnKey||null,status:['added','modified','deleted'].includes(change.status)?change.status:'unknown',partial,beforeHash:typeof change.beforeHash==='string'&&/^[a-f0-9]{64}$/.test(change.beforeHash)?change.beforeHash:null,additions:Number.isSafeInteger(change.additions)&&change.additions>=0?change.additions:null,deletions:Number.isSafeInteger(change.deletions)&&change.deletions>=0?change.deletions:null,afterHash:typeof change.afterHash==='string'&&/^[a-f0-9]{64}$/.test(change.afterHash)?change.afterHash:null};
   const evidence={path:name,contentHash:file.contentHash,byteSize:file.bytes,startLine:start,endLine:end,capturedAt:new Date().toISOString(),evidenceTime:'capture-time',recorded,recordedVersionMatch:recorded.afterHash?recorded.afterHash===file.contentHash:null};
   items.push({id:hash([sourceKey,file.contentHash,start,end,hash(excerpt),recorded]),sourceKey,kind:'file-excerpt',authority:'recorded-observation',contentHash:file.contentHash,body:excerpt,title:name,truncated:start>1||end<lines.length||excerpt.length<file.text.length,fileEvidence:evidence,fileTarget:{projectId:project.id,root,rootIdentity:file.rootIdentity,configuredPath:project.path,cwd:run.cwd},changeFingerprint:hash(change),originalSize:file.bytes});
  }catch(error){omissions.push({kind:'file-excerpt',reason:`${name}：${reasons[error.code]||'文件不可读取'}`});}
 }
 if(list.length>=LIMITS.candidates)omissions.push({kind:'file-excerpt',reason:'仅检查最近 100 个变更候选，列表可能不完整'});
 return {items,omissions};
}
function currentFile(item,project,run){if(!project||project.id!==item.fileTarget.projectId||project.path!==item.fileTarget.configuredPath||run.cwd!==item.fileTarget.cwd||run.remote||project.type==='ssh')return 'unavailable';try{if(fs.realpathSync(project.path)!==item.fileTarget.root||fs.realpathSync(run.cwd)!==item.fileTarget.root)return 'unavailable';const now=readFile(item.fileTarget.root,item.fileEvidence.path);if(now.rootIdentity!==item.fileTarget.rootIdentity)return 'unavailable';return now.contentHash===item.contentHash?'unchanged':'changed';}catch(error){return error.code==='ENOENT'?'missing':'unavailable';}}
module.exports={LIMITS,readFile,captureFiles,currentFile,candidates};
