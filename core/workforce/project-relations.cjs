const {id,text}=require('./contract.cjs');
const kinds=['api','artifact','contract'];
function relations(value=[]){
 if(!Array.isArray(value)||value.length>50)throw Error('项目关系最多 50 条');
 const result=value.map(r=>{
  if(r.targetProjectId!==''&&!id(r.targetProjectId)||!kinds.includes(r.kind))throw Error('项目关系格式无效');
  return {targetProjectId:r.targetProjectId,kind:r.kind,description:text(r.description||'','交接约定',2000,true)};
 });
 if(new Set(result.map(r=>r.targetProjectId+':'+r.kind)).size!==result.length)throw Error('相同项目的关系类型不可重复');
 return result;
}
function binding(value){
 if(!value)return undefined;
 return {responsibility:text(value.responsibility||'','项目职责',2000,true),relations:relations(value.relations),confirmed:value.confirmed===true,...(['space','history'].includes(value.reusedFrom)?{reusedFrom:value.reusedFrom}:{})};
}
function context(value={},projectIds){
 if(!Array.isArray(value.roles||[])||(value.roles||[]).length>50||!Array.isArray(value.relations||[])||(value.relations||[]).length>100)throw Error('项目职责与关系格式无效');
 const roles=(value.roles||[]).map(r=>{if(!projectIds.includes(r.projectId))throw Error('职责项目不属于空间');return {projectId:r.projectId,responsibility:text(r.responsibility,'项目职责',2000)};});
 if(new Set(roles.map(r=>r.projectId)).size!==roles.length)throw Error('项目职责重复');
 const links=(value.relations||[]).map(r=>{
  const link=relations([r])[0];
  if(!projectIds.includes(r.sourceProjectId)||!projectIds.includes(link.targetProjectId)||r.sourceProjectId===link.targetProjectId||!link.description)throw Error('请选择空间内不同的项目并填写交接约定');
  return {sourceProjectId:r.sourceProjectId,...link};
 });
 if(new Set(links.map(r=>r.sourceProjectId+':'+r.targetProjectId+':'+r.kind)).size!==links.length)throw Error('项目关系重复');
 return {roles,relations:links};
}
function issues(packages,space,{confirmed=true,locale='zh-CN',onlyIds}={}){
 const missing=[],L=(zh,en)=>locale==='en'?en:zh;
 for(const p of packages){
  if(p.mode!=='work'||onlyIds&&!onlyIds.includes(p.id))continue;
  const label=p.title||p.id,b=p.projectBinding;
  const push=(zh,en)=>missing.push(label+': '+L(zh,en));
  if(!space.projectIds.includes(p.projectId)||!space.members.find(m=>m.employeeId===p.ownerId)?.projectIds.includes(p.projectId))push('请选择负责人获授权的执行项目','Choose an authorized execution project');
  if(!b?.responsibility?.trim())push('请填写项目职责','Add the project responsibility');
  if(confirmed&&!b?.confirmed)push('请确认项目职责与关系','Confirm project responsibilities and relationships');
  const links=b?.relations||[];
  for(const r of links){if(r.targetProjectId===p.projectId||!space.projectIds.includes(r.targetProjectId)||!kinds.includes(r.kind)||!r.description?.trim())push('请补全空间内不同项目的交接约定','Complete the handoff agreement between projects in this space');}
  for(const target of new Set(p.dependencies.map(id=>packages.find(q=>q.id===id)).filter(q=>q?.mode==='work'&&q.projectId&&q.projectId!==p.projectId).map(q=>q.projectId))){
   if(!links.some(r=>r.targetProjectId===target))push('请说明与前置任务项目的关系（'+target+'）','Describe the relationship to the prerequisite project ('+target+')');
  }
 }
 return [...new Set(missing)];
}
function proposal(p,space){
 const saved=space.projectContext||{};
 return {responsibility:p.projectBinding?.responsibility||saved.roles?.find(r=>r.projectId===p.projectId)?.responsibility||'',relations:p.projectBinding?.relations||saved.relations?.filter(r=>r.sourceProjectId===p.projectId).map(({sourceProjectId,...r})=>r)||[],confirmed:false};
}
// Only public project facts. Configuration is never evidence of a live connection.
function projectFacts(projects,ids){return projects.filter(p=>ids.includes(p.id)).map(p=>({id:p.id,name:p.name,type:p.type||'local',path:p.path,environment:p.environment?.kind||null,connectionConfigured:p.type==='ssh'?!!p.connectionId:null}));}
module.exports={binding,context,issues,proposal,projectFacts};
