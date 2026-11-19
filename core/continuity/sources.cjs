const fs=require('node:fs');
const path=require('node:path');
function canonical(value){
 if(Array.isArray(value))return value.map(canonical);
 if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().filter(k=>value[k]!==undefined).map(k=>[k,canonical(value[k])]));
 return value;
}
const {hash,isText}=require('../../electron/stored-json.cjs');
const key=(kind,...ids)=>JSON.stringify([kind,...ids]);
function source(kind,identity,revisionKey,body,semantic,scope,state,locator,fingerprints){
 const sourceKey=key(kind,...identity),contentHash=fingerprints?.contentHash??hash(body),semanticHash=fingerprints?.semanticHash??hash({body,...semantic});
 return {id:hash([sourceKey,String(revisionKey)]),sourceKey,kind,revisionKey:String(revisionKey),fingerprintVersion:1,contentHash,semanticHash,body,locator,scope,
  evidenceKey:kind==='discussion-statement'?key('run-message',locator.runId,locator.messageId):sourceKey,
  provenance:'recorded',...semantic,...state,stateFingerprint:hash({semanticHash,scope,...state})};
}
function deletedDiscussion(state,requestId){return Object.entries(state.discussionStates||{}).some(([id,s])=>s.status==='deleted'&&(id===requestId||s.requestIds?.includes(requestId)));}
function documentSources(state,root){
 const result=[];
 for(const doc of state.documents||[])for(const v of doc.versions||[]){
  let body='',availability=doc.deletedAt?'withdrawn':'available';
  const safe=[doc.spaceId,doc.id].every(s=>typeof s==='string'&&/^[a-zA-Z0-9_-]+$/.test(s))&&/^[a-f0-9]{64}$/.test(v.hash||'');
  try{if(!safe)throw Error('invalid path');const folder=fs.realpathSync(path.resolve(root,'workforce','documents')),file=path.join(folder,doc.spaceId,doc.id,v.hash+'.md');const real=fs.realpathSync(file);if(!real.startsWith(folder+path.sep))throw Error('outside source root');body=fs.readFileSync(real,'utf8');if(hash(body)!==v.hash)throw Error('hash mismatch');}catch{availability=doc.deletedAt?'withdrawn':'unverifiable';body='';}
  if(!(state.spaces||[]).some(s=>s.id===doc.spaceId))availability='deleted';
  result.push(source('space-document',[doc.spaceId,doc.id],v.revision,body,{title:v.title||'',conditions:v.conditions||'',sourceRefs:v.sourceRefs||[]},
   {spaceId:doc.spaceId}, {availability,provenance:v.legacyStatusUnknown?'legacy':'recorded',authority:doc.adoptedRevision===v.revision?'adopted':doc.versions.some(next=>next.revision>v.revision)||doc.adoptions?.some(a=>a.revision===v.revision)?'historical':'reference'},
   {spaceId:doc.spaceId,documentId:doc.id,revision:v.revision}));
 }
 return result;
}
function runSources(run,state){
 if(run.originHandoff)return []; // Guarded investigation results are never copied into generic knowledge.
 const result=[],messages=run.messages||[];let turn=null;
 const turns=new Map();
 for(const m of messages){if(m.role==='user'&&!m.turnKey)turn=m.id;if(turn){const t=turns.get(turn)||[];t.push(m);turns.set(turn,t);}}
 for(const [hostTurnKey,items] of turns){
  const user=items[0],completed=user.timing?.outcome==='completed'||run.terminalTurnId===hostTurnKey&&run.status==='completed';
  if(!completed)continue;
  const requestId=run.collaboration?.requestId,spaceId=run.collaboration?.spaceId;
  const request=(state.requests||[]).find(r=>r.id===requestId),p=request?.participants?.find(p=>p.runId===run.id||p.employeeId===run.employee?.id);
  const availability=spaceId&&!(state.spaces||[]).some(s=>s.id===spaceId)||deletedDiscussion(state,requestId)?'deleted':run.collaboration?.sourceRevoked?'withdrawn':'available';
  const final=items.filter(m=>m.role==='assistant'&&!m.kind).findLast(m=>m.phase==='final_answer')||items.filter(m=>m.role==='assistant'&&!m.kind&&!m.phase).at(-1);
  for(const m of [...items.filter(m=>m.role==='user'&&!m.kind),final].filter(Boolean)){
   if(!m.id||!(typeof m.text==='string'||isText(m.text))||m.kind||m.role==='user'&&m.inputDeliveryState&&m.inputDeliveryState!=='delivered')continue;
   const locator={runId:run.id,messageId:m.id,hostTurnKey};
   const scope={...(spaceId?{spaceId}:{}),historySpaceIds:run.collaboration?.historySpaceIds||[],projectId:run.projectId||null,employeeId:run.employee?.id||null};
   const refs=[...(run.collaboration?.documents||[]),...(run.collaboration?.retrievedRefs||[])].map(({id,revision,hash})=>({id,revision,hash}));
   const semantic={role:m.role,title:run.title||'',sourceRefs:refs},discussion=m===final&&p?.contribution?.provenance==='recorded'&&p.contribution.author?.id===run.employee?.id;
   const discussionSemantic={role:'assistant',title:request?.prompt||'',sourceRefs:refs};
   const fingerprints=require('../../electron/stored-json.cjs').textFingerprints(m.text,[{key:'text',value:{role:m.role}},{key:'body',value:semantic},...(discussion?[{key:'body',value:discussionSemantic}]:[])]);
   result.push(source('run-message',[run.id,m.id],fingerprints.forms[0],m.text,semantic,scope,{availability,authority:'reference'},locator,{contentHash:fingerprints.contentHash,semanticHash:fingerprints.forms[1]}));
   if(discussion)result.push(source('discussion-statement',[spaceId,requestId,p.contribution.id,m.id],fingerprints.contentHash,m.text,discussionSemantic,scope,{availability,authority:'reference'},{...locator,spaceId,requestId,contributionId:p.contribution.id},{contentHash:fingerprints.contentHash,semanticHash:fingerprints.forms[2]}));
  }
 }
 return result;
}
function reviewSources(state,runs=[]){
 const result=[];
 for(const plan of state.plans||[])for(const p of plan.packages||[])for(const attempt of p.attempts||[]){
  const review=attempt.review||(p.acceptance?.attemptId===attempt.id?p.acceptance:null);if(!review)continue;
  const run=runs.find(r=>r.id===attempt.runId);
  const actualHash=run&&hash(JSON.stringify({messages:run.messages,tools:run.tools,fileChanges:run.fileChanges,workEvidence:run.workEvidence}));
  const resultState=!run?'unverifiable':run.status==='completed'&&actualHash===attempt.resultHash?'matched':'changed';
  const current=p.acceptance?.attemptId===attempt.id&&p.acceptance?.resultHash===attempt.resultHash&&!p.stale&&resultState==='matched';
  result.push(source('plan-review',[plan.id,p.id,attempt.id],hash(review),JSON.stringify(canonical(review)),{title:p.definition?.title||'',reviewSource:review.source||'unknown',accepted:review.accepted===true,sourceRefs:attempt.inputRefs||[]},
   {spaceId:plan.spaceId,employeeId:p.definition?.employeeId||null}, {availability:(state.spaces||[]).some(s=>s.id===plan.spaceId)?'available':'deleted',authority:current?'reference':'historical',resultState},
   {spaceId:plan.spaceId,planId:plan.id,packageId:p.id,attemptId:attempt.id,resultHash:attempt.resultHash}));
 }
 return result;
}
function expertChatSources(db,conversationId){
 const result=[];
 for(const row of conversationId?db.prepare('SELECT data FROM expert_chats WHERE id=?').all(conversationId):db.prepare('SELECT data FROM expert_chats').iterate()){
  const chat=JSON.parse(row.data),anchor=db.prepare('SELECT * FROM conversation_identities WHERE id=?').get(chat.id);
  if(!anchor||!['draft','run'].includes(anchor.kind))continue;
  for(const turn of chat.turns){
   if(turn.status!=='completed'||!turn.domainId||!turn.answer||turn.taskContextProjectionId||turn.inheritedTaskProjectionIds?.length)continue; // Task delegation is not a grant to publish long-term knowledge.
   // Every injected dependency is retained, not only citations chosen by the model.
   const refs=(turn.references||[]).map(r=>r.ref),excluded=refs.some(r=>chat.excludedSourceKeys.includes(r.sourceKey));
   result.push(source('expert-contribution',[chat.id,turn.id],hash([turn.text,turn.answer]),JSON.stringify({question:turn.text,answer:turn.answer,unresolvedQuestions:turn.unresolvedQuestions||[]}),
    {title:'专家讨论',domainId:turn.domainId,role:'assistant',continuityRefs:refs,knowledgeRefs:turn.knowledgeRefs||[],roleSnapshot:turn.employee},
    {employeeId:turn.employee.id,projectId:anchor.project_id||null},
    {availability:excluded||turn.projectId!==(anchor.project_id||null)?'withdrawn':'available',authority:'reference'},
    {conversationId:chat.id,turnId:turn.id}));
  }
 }
 return result;
}
module.exports={expertChatSources,hash,key,canonical,documentSources,runSources,reviewSources};
