const fs=require('node:fs/promises');const os=require('node:os');const path=require('node:path');
const {execFile}=require('node:child_process');const {promisify}=require('node:util');const exec=promisify(execFile);
function validate(input){
 if(!input||Object.keys(input).some(k=>!['repository','directory','ref','replaceId','asNew'].includes(k)))throw Error('技能安装参数无效');
 const url=new URL(input.repository);if(url.protocol!=='https:'||url.hostname!=='github.com'||url.port||url.username||url.password||url.search||url.hash||!/^\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/?$/.test(url.pathname))throw Error('请选择有效的 GitHub 仓库地址');
 const directory=input.directory;if(typeof directory!=='string'||!directory||directory.length>500||directory.includes('\\')||directory.split('/').some(p=>!p||p==='.'||p==='..'||p.includes('\0')))throw Error('技能子目录必须是安全的仓库相对路径');
 if(input.ref!==undefined&&(typeof input.ref!=='string'||!input.ref||input.ref.length>200||input.ref.startsWith('-')||! /^[A-Za-z0-9_./-]+$/.test(input.ref)))throw Error('版本引用无效');
 if(input.replaceId!==undefined&&typeof input.replaceId!=='string'||input.asNew!==undefined&&typeof input.asNew!=='boolean'||input.replaceId&&input.asNew)throw Error('同名处理参数无效');
 return {...input,repository:url.origin+url.pathname.replace(/\/$/,'').replace(/\.git$/,'')};
}
async function checkout(input,{run=exec,signal}={}){
 const spec=validate(input),root=await fs.mkdtemp(path.join(os.tmpdir(),'amble-skill-download-'));
 const cleanup=()=>fs.rm(root,{recursive:true,force:true});
 try{
  const options={cwd:root,timeout:120000,maxBuffer:1024*1024,signal,env:{...process.env,GIT_TERMINAL_PROMPT:'0',GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:os.devNull}};
  const git=args=>run('git',['-c','core.hooksPath='+os.devNull,'-c','protocol.file.allow=never',...args],options);
  await git(['init','--quiet']);await git(['remote','add','origin',spec.repository+'.git']);await git(['fetch','--depth=1','--no-tags','origin',spec.ref||'HEAD']);
  const {stdout}=await git(['rev-parse','FETCH_HEAD']);const commit=stdout.trim();if(!/^[a-f0-9]{40,64}$/.test(commit))throw Error('仓库版本解析失败');
  // Avoid running checkout filters or loading repository-specific commands.
  await git(['-c','filter.lfs.required=false','checkout','--detach','--force',commit]);
  let source=root;for(const part of spec.directory.split('/')){source=path.join(source,part);if((await fs.lstat(source)).isSymbolicLink())throw Error('技能路径不能包含符号链接');}
  if(!(await fs.stat(source)).isDirectory())throw Error('技能子目录不存在');
  return {source,provenance:{kind:'github',repository:spec.repository,directory:spec.directory,requestedRef:spec.ref||'HEAD',commit},cleanup};
 }catch(e){await cleanup();throw e;}
}
module.exports={validate,checkout};
