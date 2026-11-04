const {randomUUID}=require('node:crypto');
const {text}=require('./contract.cjs');
const R=require('./project-relations.cjs');
const {validateValues}=require('../forms/runtime-template.cjs');
const clean=b=>({responsibility:b.responsibility,relations:[...b.relations].sort((a,b)=>(a.targetProjectId+a.kind).localeCompare(b.targetProjectId+b.kind))});
const same=(a,b)=>JSON.stringify(clean(a))===JSON.stringify(clean(b));
function knownBindings(state,space,excludeDraftId){
 const candidates=new Map(),explicit=new Map();
 for(const role of space.projectContext?.roles||[]){
  const b={responsibility:role.responsibility,relations:(space.projectContext.relations||[]).filter(r=>r.sourceProjectId===role.projectId).map(({sourceProjectId,...r})=>r),confirmed:true};
  explicit.set(role.projectId,{projectId:role.projectId,binding:b,source:'space'});
 }
 const definitions=[...(state.plans||[]).filter(p=>p.spaceId===space.id).flatMap(p=>p.packages.map(p=>p.definition)),...(state.taskDrafts||[]).filter(d=>d.spaceId===space.id&&d.id!==excludeDraftId).flatMap(d=>d.value.packages)];
 for(const p of definitions){
  if(p.mode!=='work'||!p.projectBinding?.confirmed||!space.projectIds.includes(p.projectId))continue;
  const b=R.binding(p.projectBinding);if(!b.responsibility||b.relations.some(r=>!space.projectIds.includes(r.targetProjectId)||r.targetProjectId===p.projectId||!r.description))continue;
  const list=candidates.get(p.projectId)||[];if(!list.some(item=>same(item.binding,b)))list.push({projectId:p.projectId,binding:b,source:'history'});candidates.set(p.projectId,list);
 }
 const bindings=[...explicit.values()],conflicts=[];
 for(const [projectId,list] of candidates){if(explicit.has(projectId))continue;if(list.length===1)bindings.push(list[0]);else conflicts.push(projectId);}
 return {bindings,conflicts};
}
function inherit(packages,space,known,previous=[]){
 return packages.map(p=>{
  if(p.mode!=='work')return p;
  const old=previous.find(q=>q.id===p.id&&q.ownerId===p.ownerId&&q.projectId===p.projectId&&q.mode===p.mode&&JSON.stringify(q.dependencies)===JSON.stringify(p.dependencies));
  const k=known.bindings.find(k=>k.projectId===p.projectId);
  const proposed=p.projectBinding||{responsibility:'',relations:[],confirmed:false};
  // An explicit changed description is a conflict; the model cannot approve it.
  const compatible=b=>(!proposed.responsibility||proposed.responsibility===b.responsibility)&&proposed.relations.every(r=>b.relations.some(v=>v.targetProjectId===r.targetProjectId&&v.kind===r.kind&&v.description===r.description));
  const source=old?.projectBinding?.confirmed&&compatible(old.projectBinding)?{binding:old.projectBinding,source:old.projectBinding.reusedFrom}:k&&compatible(k.binding)?k:null;
  const projectBinding=source?{...source.binding,confirmed:true,...(source.source?{reusedFrom:source.source}:{})}:{...proposed,confirmed:false};
  const next={...p,projectBinding};
  if(R.issues(packages.map(q=>q.id===p.id?next:q),space,{onlyIds:[p.id],confirmed:false}).length)next.projectBinding={...projectBinding,confirmed:false};
  return next;
 });
}
function buildGuide(packages,space,projects,locale='zh-CN',reasons={}){
 const L=(zh,en)=>locale==='en'?en:zh,nodes=[];
 for(const p of packages){
  if(p.mode!=='work'||!R.issues(packages,space,{onlyIds:[p.id]}).length)continue;
  const available=projects.filter(q=>space.projectIds.includes(q.id)&&space.members.find(m=>m.employeeId===p.ownerId)?.projectIds.includes(q.id));
  if(!available.length)continue; // Cannot solve absent authority by inventing a project.
  const b=p.projectBinding||{responsibility:'',relations:[]};
  const links=[...b.relations];
  for(const dep of p.dependencies){const q=packages.find(q=>q.id===dep);if(q?.mode==='work'&&q.projectId&&q.projectId!==p.projectId&&!links.some(r=>r.targetProjectId===q.projectId))links.push({targetProjectId:q.projectId,kind:'artifact',description:''});}
  const fields=[{name:'projectId',type:'select',label:L('这个节点在哪个项目执行？','Which project should execute this task?'),required:true,options:available.map(q=>({value:q.id,label:q.name+(q.id===p.projectId?L('（推荐）',' (Recommended)'):'')}))},{name:'responsibility',type:'textarea',label:L('这个项目负责什么？','What is this project responsible for?'),required:true,maxLength:2000},{name:'relationshipMode',type:'select',label:L('是否需要其他项目配合？','Does this task rely on another project?'),required:true,options:[{value:'related',label:L('需要，核对下面的交接约定','Yes — review the handoffs below')},{value:'independent',label:L('不需要其他项目','No other project required')}]}];
  const prefill={projectId:available.some(q=>q.id===p.projectId)?p.projectId:'',responsibility:b.responsibility,relationshipMode:links.length?'related':'independent'};
  const rows=links.length?links:[{targetProjectId:'',kind:'api',description:''}];
  rows.forEach((r,i)=>{
   const visibleWhen={field:'relationshipMode',equals:'related'},target='target'+i,kind='kind'+i,description='description'+i;
   fields.push({name:target,type:'select',label:L('协作项目','Related project')+' '+(i+1),required:true,visibleWhen,options:projects.filter(q=>space.projectIds.includes(q.id)).map(q=>({value:q.id,label:q.name}))},{name:kind,type:'select',label:L('如何协作？','How do the projects collaborate?'),required:true,visibleWhen,options:[{value:'api',label:L('接口调用','API usage')},{value:'artifact',label:L('产物交接','Artifact handoff')},{value:'contract',label:L('共享契约','Shared contract')}]},{name:description,type:'textarea',label:L('需要交接什么，如何核验？','What is handed off, and how is it verified?'),required:true,maxLength:2000,visibleWhen});
   Object.assign(prefill,{[target]:r.targetProjectId,[kind]:r.kind,[description]:r.description});
  });
  nodes.push({packageId:p.id,title:p.title,reason:text(reasons[p.id]||L('核对 AI 的项目建议，补充尚未明确的职责与交接约定。','Review the AI project suggestion and clarify responsibilities and handoffs.'),'关系引导说明',2000),fields,prefill});
 }
 return nodes.length?{requestKey:randomUUID(),spaceRevision:space.revision,nodes}:null;
}
function answerNode(guide,packageId,answers){
 const node=guide.nodes.find(n=>n.packageId===packageId);if(!node)throw Error('关系问题已更新，请重新检查');
 const {values,errors}=validateValues({fields:node.fields},answers,{answers});
 if(Object.keys(errors).length)throw Error('请补齐关系表单：'+Object.keys(errors).map(key=>node.fields.find(f=>f.name===key)?.label).join('、'));
 const relations=[];
 if(values.relationshipMode==='related')for(const field of node.fields.filter(f=>/^target\d+$/.test(f.name))){const index=field.name.slice(6);relations.push({targetProjectId:values[field.name],kind:values['kind'+index],description:values['description'+index]});}
 return {projectId:values.projectId,projectBinding:R.binding({responsibility:values.responsibility,relations,confirmed:true})};
}
const str={type:'string'},linkSchema={type:'object',additionalProperties:false,required:['targetProjectId','kind','description'],properties:{targetProjectId:str,kind:{type:'string',enum:['api','artifact','contract']},description:str}};
const outputSchema={type:'object',additionalProperties:false,required:['summary','nodes'],properties:{summary:str,nodes:{type:'array',maxItems:30,items:{type:'object',additionalProperties:false,required:['packageId','projectId','responsibility','relations','reason'],properties:{packageId:str,projectId:str,responsibility:str,relations:{type:'array',maxItems:20,items:linkSchema},reason:str}}}}};
const prompt='Help complete ONLY unresolved project relationships in this existing task draft. Return targeted project assignments, project responsibilities, handoff relationships and a concise question/explanation (reason) for each unresolved work node. Use only package IDs from gaps and project IDs assigned to that node owner. Never change titles, instructions, owners, dependencies, documents or acceptance criteria. Never change already confirmed nodes. Reuse exact known responsibilities and relationships when suitable; new/changed relationships are proposals for user confirmation. Describe concrete handoffs and verification, not connectivity claims. Include direct cross-project prerequisites. Use the user clarification and existing discussion to resolve ambiguity; leave values empty if unknown rather than inventing facts. The host turns each suggestion into editable declarative fields with project choices and validates the answers. No task execution.';
module.exports={knownBindings,inherit,buildGuide,answerNode,outputSchema,prompt};
