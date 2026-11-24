const {previewTool}=require('./tool-previews.cjs');
function previewMessage(message){
 const result={};for(const key of Object.keys(message))if(!['text','summary','content'].includes(key))result[key]=message[key];
 const body=require('./runtime-text-cache.cjs').preview(message,'text',8192);
 return {...result,text:body.text,...(body.length>body.text.length?{textPreview:true,textVersion:body.version,textChars:body.length}:{})};
}
// Transient UI state is deliberately absent from the serialized run.
function saveView(run){
 const pending=run.pendingRecord;
 return pending?{...run,status:pending.final.status,error:pending.final.error,recordSaving:true,saveIssue:pending.issue}:run;
}
function summary(run) {
 const {messages,tools,plans,fileChanges,artifacts,taskApps,approvals,questions,modelRequests,...meta}=saveView(run);
 return {...meta,lastTurnStartedAt:messages?.findLast(message=>message.role==='user'&&!message.turnKey)?.timing?.startedAt||run.createdAt,messages:[],tools:[],approvals:[],summaryOnly:true};
}
function projectPage(run,before,limit=30) {
 if(!run)throw new Error('会话不存在');
 if(!Number.isInteger(limit)||limit<1||limit>100)throw new Error('分页大小无效');
 const users=run.messages.filter(m=>m.role==='user'&&!m.turnKey);
 const end=before===undefined?users.length:users.findIndex(m=>m.id===before);
 if(end<0)throw new Error('历史分页位置已失效');
 const start=Math.max(0,end-limit);const first=users[start];const last=users[end];
 const messages=run.messages.slice(first?run.messages.indexOf(first):0,last?run.messages.indexOf(last):run.messages.length);
 const keys=new Set(users.slice(start,end).map(m=>m.id));
 const {modelRequests,...publicRun}=saveView(run);
 return {...publicRun,messages:messages.map(previewMessage),taskApps:run.taskApps?.filter(p=>keys.has(p.turnKey)),fileChanges:run.fileChanges?.filter(p=>keys.has(p.turnKey)),tools:run.tools.filter(t=>keys.has(t.turnKey)||(!t.turnKey&&users.length===1)).map(previewTool),plans:run.plans?.filter(p=>keys.has(p.turnKey)),artifacts:run.artifacts?.filter(p=>keys.has(p.turnKey)),summaryOnly:false,historyBefore:start?first.id:null,turnOffset:start,totalTurns:users.length};
}
function pageRun(...args){const started=performance.now();try{return projectPage(...args);}finally{require('./performance-metrics.cjs').metrics.record('pageRunMs',performance.now()-started);}}
function requestState(run){
 if(!run)throw new Error('会话不存在');
 return {id:run.id,status:run.status,approval:!!run.approvals?.length,input:!!run.questions?.length};
}
module.exports={saveView,summary,pageRun,previewMessage,requestState};
