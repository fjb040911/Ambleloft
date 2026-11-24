const previewPolicy = require('./artifact-preview.json');
const fs = require('node:fs/promises');
const path = require('node:path');
const {randomUUID} = require('node:crypto');
const {engineRuntime} = require('./engine.cjs');
const {validDelivery} = require(engineRuntime().packaged ? path.join(process.resourcesPath, 'tools/plan-server.cjs') : './plan-server.cjs');
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
  const deliveries=new Map();
  for(const tool of run.tools.filter(t=>t.turnKey===turnKey&&t.type==='deliverable'&&t.status==='completed')) {
    try {const args=JSON.parse(tool.detail);if(!validDelivery(args))continue;const file=await verifiedFile(run.cwd,args.path);deliveries.set(file.path,args.title.trim());candidates.add(file.path);}catch{}
  }
  // Only explicit registrations are deliverables; directory changes and reads are not.
  const artifacts=[];
  for(const candidate of [...candidates].slice(0,50)) {
    try {const file=await verifiedFile(run.cwd,candidate);artifacts.push({id:randomUUID(),turnKey,...file,kind:'delivery',title:deliveries.get(file.path)});} catch { /* Unverified references never become delivered files. */ }
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
async function artifactAvailability(run,ids){
  if(!run || !Array.isArray(ids) || ids.some(id=>typeof id!=='string'))throw new Error('无效的交付文件记录');
  const wanted=new Set(ids),statuses={};
  for(const file of run.artifacts||[]){
    if(!wanted.has(file.id))continue;
    try{
      await verifiedFile(run.cwd,file.path);
      statuses[file.id]='available';
    }catch(error){
      statuses[file.id]=['ENOENT','ENOTDIR'].includes(error.code)?'missing':'unavailable';
    }
  }
  return statuses;
}
// Resolve message links against the host's complete run, including deliveries
// registered during a turn that has not been committed to run.artifacts yet.
async function downloadArtifact(run, reference, chooseDestination) {
  if (!run || run.projectId || typeof reference !== 'string' || !reference || reference.includes('\0')) {
    throw new Error('此链接未对应到当前任务的交付文件');
  }
  const target = path.resolve(run.cwd, reference);
  const matches = file => typeof file === 'string' && path.relative(target, path.resolve(run.cwd, file)) === '';
  const registered = run.artifacts?.some(file => file.kind !== 'change' && matches(file.path))
    || run.tools?.some(tool => {
      if (tool.type !== 'deliverable' || tool.status !== 'completed') return false;
      try { const args = JSON.parse(tool.detail); return validDelivery(args) && matches(args.path); }
      catch { return false; }
    });
  if (!registered) throw new Error('此链接未对应到当前任务的交付文件');

  let source, temporary;
  try {
    const file = await verifiedFile(run.cwd, target);
    const destination = await chooseDestination(file.name);
    if (!destination) return;
    const verified = await verifiedFile(run.cwd, target);
    source = await fs.open(verified.path, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
    const opened = await source.stat();
    const current = await fs.stat((await verifiedFile(run.cwd, target)).path);
    if (!opened.isFile() || opened.dev !== current.dev || opened.ino !== current.ino) throw new Error('文件已变更，请重新下载');
    if (path.relative(verified.path, destination) === '') return;
    temporary = await fs.mkdtemp(path.join(path.dirname(destination), '.amble-download-'));
    const staged = path.join(temporary, 'download');
    await require('node:stream/promises').pipeline(source.createReadStream(), require('node:fs').createWriteStream(staged, {flags:'wx', mode:0o600}));
    await fs.rename(staged, destination);
  } catch (error) {
    if (error.code === 'ENOENT') throw new Error('文件或保存目录已移动或删除，请重新选择');
    if (error.code === 'EACCES' || error.code === 'EPERM') throw new Error('无法读写文件，请检查文件权限或更换保存位置');
    if (error.code === 'ENOSPC') throw new Error('保存位置空间不足，请更换位置后重试');
    throw error;
  } finally {
    await source?.close();
    if (temporary) await fs.rm(temporary, {recursive:true, force:true});
  }
}
module.exports={collectArtifacts,accessArtifact,downloadArtifact,verifiedFile,artifactAvailability};
