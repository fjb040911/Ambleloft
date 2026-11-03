const {createHash,randomUUID}=require('node:crypto');

// A round is one user submission. Contributions identify independently dispatched
// experts, not turns in a simulated exchange. Run messages remain the source of text.
function createContribution({member,employee,request,space,docs,historySpaceIds,priorDiscussion}){
  const shared={prompt:request.prompt,purpose:space.purpose,assignment:member.assignment,documents:docs,historySpaceIds,priorDiscussion};
  return {
    id:randomUUID(),author:{kind:'expert',id:member.employeeId,name:employee?.name||null},
    stage:'analysis',replyToContributionId:null,provenance:'recorded',
    context:{version:createHash('sha256').update(JSON.stringify(shared)).digest('hex'),assignment:member.assignment||'',
      priorRequestIds:priorDiscussion?[...priorDiscussion.earlierRounds.map(r=>r.requestId),priorDiscussion.requestId]:[],
      completeHistory:!!priorDiscussion?.sources,historyTruncated:!!priorDiscussion?.historyTruncated,historySpaceIds:[...historySpaceIds],
      documents:docs.map(({id,title,revision,hash})=>({id,title,revision,hash}))}
  };
}
function projectContribution(request,participant,run){
  const saved=participant.contribution;
  // Legacy records have identity but do not prove a stage, reply target or exact
  // input snapshot. Derive stable display IDs without writing a migration.
  const base=saved||{id:`legacy:${request.id}:${participant.employeeId}`,author:{kind:'expert',id:participant.employeeId,name:null},stage:null,replyToContributionId:null,provenance:'legacy',context:null};
  return {...base,author:{...base.author,name:run?.employee?.name||base.author.name},runId:run?.id||participant.runId||null,model:run?.model||participant.execution?.model||null};
}
module.exports={createContribution,projectContribution};
