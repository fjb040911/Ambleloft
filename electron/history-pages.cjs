function summary(run) {
 const {messages,tools,plans,artifacts,approvals,questions,...meta}=run;
 return {...meta,messages:[],tools:[],approvals:[],summaryOnly:true};
}
function pageRun(run,before,limit=30) {
 if(!run)throw new Error('会话不存在');
 if(!Number.isInteger(limit)||limit<1||limit>100)throw new Error('分页大小无效');
 const users=run.messages.filter(m=>m.role==='user');
 const end=before===undefined?users.length:users.findIndex(m=>m.id===before);
 if(end<0)throw new Error('历史分页位置已失效');
 const start=Math.max(0,end-limit);const first=users[start];const last=users[end];
 const messages=run.messages.slice(first?run.messages.indexOf(first):0,last?run.messages.indexOf(last):run.messages.length);
 const keys=new Set(users.slice(start,end).map(m=>m.id));
 return {...run,messages,tools:run.tools.filter(t=>keys.has(t.turnKey)||(!t.turnKey&&users.length===1)),plans:run.plans?.filter(p=>keys.has(p.turnKey)),artifacts:run.artifacts?.filter(p=>keys.has(p.turnKey)),summaryOnly:false,historyBefore:start?first.id:null,turnOffset:start,totalTurns:users.length};
}
module.exports={summary,pageRun};
