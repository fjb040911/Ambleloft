const previewPolicy = require('./artifact-preview.json');
const fs = require('node:fs/promises');
const path = require('node:path');
const {randomUUID} = require('node:crypto');
async function verifiedFile(cwd, candidate) {
  const root = await fs.realpath(cwd);
  const file = await fs.realpath(path.resolve(root, candidate));
  const relative = path.relative(root, file);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative) || relative.split(path.sep).some(part=>part.startsWith('.')||part==='node_modules')) throw new Error('文件不在可交付的工作目录中');
  const stat = await fs.stat(file);
  if (!stat.isFile()) throw new Error('文件已不存在或不是普通文件');
  return {path:file,name:path.basename(file),size:stat.size,modifiedAt:stat.mtime.toISOString()};
}
async function collectArtifacts(run, turnKey) {
  const candidates = new Set();
  for(const tool of run.tools.filter(t=>t.turnKey===turnKey&&t.type==='fileChange'&&t.status==='completed')) {
    try { for(const change of JSON.parse(tool.detail)) if(typeof change.path==='string')candidates.add(change.path); } catch {}
  }
  const messages=run.messages.filter(m=>m.turnKey===turnKey&&m.role==='assistant'&&!m.kind);
  const final=messages.findLast(m=>m.phase==='final_answer')||messages.findLast(m=>!m.phase);
  for(const match of (final?.text||'').matchAll(/\[[^\]]*\]\((?:<([^>]+)>|([^\s)]+))\)|`([^`\n]+\.[a-zA-Z0-9]{1,10})`/g)) {
    let value=match[1]||match[2]||match[3];
    if(/^[a-zA-Z]+:/.test(value))continue;
    try {value=decodeURIComponent(value);} catch {}
    candidates.add(value);
  }
  const artifacts=[];
  for(const candidate of [...candidates].slice(0,50)) {
    try {artifacts.push({id:randomUUID(),turnKey,...await verifiedFile(run.cwd,candidate)});} catch { /* Unverified references never become delivered files. */ }
  }
  return artifacts.filter((file,i,all)=>all.findIndex(other=>other.path===file.path)===i);
}
async function accessArtifact(run, id, preview=false) {
  const artifact=run?.artifacts?.find(file=>file.id===id);
  if(!artifact)throw new Error('找不到该交付文件');
  let file;
  try {file=await verifiedFile(run.cwd,artifact.path);} catch(error) {if(error.code==='ENOENT')throw new Error('文件已移动或删除，请在工作目录中确认');if(error.code==='EACCES')throw new Error('没有权限读取该文件');throw error;}
  if(!preview)return file;
  if(!previewPolicy.extensions.includes(path.extname(file.name).slice(1).toLowerCase()))throw new Error('此文件请在访达中查看');
  if(file.size>previewPolicy.maxBytes)throw new Error('文件超过 1 MB，请在访达中查看');
  return {...file,text:await fs.readFile(file.path,'utf8')};
}
module.exports={collectArtifacts,accessArtifact,verifiedFile};
