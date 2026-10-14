// Shared by the runtime and renderer: directory changes are not authorship evidence.
export function fileKey(cwd, file) {
 const normalize=value=>value.replace(/\\/g,'/').replace(/\/+$/,'');
 const root=normalize(cwd),value=normalize(file);
 const absolute=/^(?:\/|[a-z]:\/)/i.test(value)?value:`${root}/${value}`;
 const parts=[];
 for(const part of absolute.split('/')){if(part==='.')continue;if(part==='..')parts.pop();else parts.push(part);}
 const key=parts.join('/');
 return /^[a-z]:\//i.test(key)?key.toLowerCase():key;
}
export function writePaths(run,turnKey){
 const paths=new Set();
 for(const tool of run.tools||[]){
  if(tool.turnKey!==turnKey||tool.type!=='fileChange'||tool.status!=='completed')continue;
  try{const changes=JSON.parse(tool.detail);if(!Array.isArray(changes))continue;
   for(const change of changes){
    const kind=typeof change.kind==='string'?change.kind:change.kind?.type;
    if(typeof change.path!=='string'||!['add','update','delete','added','modified','deleted'].includes(kind))continue;
    paths.add(fileKey(run.cwd,change.path));
    if(typeof change.kind?.move_path==='string')paths.add(fileKey(run.cwd,change.kind.move_path));
   }
  }catch{/* Invalid or truncated tool records cannot prove authorship. */}
 }
 return paths;
}
export function attributedChanges(run,batch){
 const paths=writePaths(run,batch.turnKey);
 return {...batch,files:batch.files.filter(file=>paths.has(fileKey(run.cwd,file.path)))};
}
export function turnFileOutputs(run,turnKey){
 const batches=(run.fileChanges||[]).filter(batch=>batch.turnKey===turnKey).map(batch=>attributedChanges(run,batch));
 // Untyped legacy entries were inferred from the directory. Do not label them as deliveries.
 const seen=new Set();
 const deliveries=(run.artifacts||[]).filter(file=>{
  if(file.turnKey!==turnKey||file.kind!=='delivery')return false;
  const key=fileKey(run.cwd,file.path);if(seen.has(key))return false;seen.add(key);return true;
 });
 return {deliveries,batches,remaining:batches.map(batch=>({...batch,files:batch.files.filter(file=>!seen.has(fileKey(run.cwd,file.path)))}))};
}
