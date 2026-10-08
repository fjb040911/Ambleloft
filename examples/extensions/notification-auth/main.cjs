exports.activate=context=>{
 context.operations.register('publish',async()=>{const eventKey=require('node:crypto').randomUUID();await context.messages.publish({eventKey,title:'待处理的演示任务',body:'点击按钮验证确认、执行和结果回报。此演示仅更新本地消息。',category:'actionRequired',actions:[{id:'complete',label:'完成任务',commandId:'example.notification-auth.complete',arguments:{eventKey}}]});return {message:'请到消息中心处理任务。'};});
 context.operations.register('complete',async(input,invocation)=>{
  if(!invocation.message)throw Object.assign(Error('Message required'),{code:'FORBIDDEN'});
  const record=(await context.messages.listActionInvocations()).find(r=>r.id===invocation.message.invocationId);
  if(!record)throw Object.assign(Error('Invocation missing'),{code:'NOT_FOUND'});
  const message=await context.messages.getByEventKey(input.eventKey);
  // Production services must use invocationId for idempotency and reconciliation.
  await context.messages.reportActionResult({invocationId:record.id,reportId:'completed',expectedRevision:record.revision,outcome:'completed',messageUpdate:{patch:{businessState:'resolved'},expectedRevision:message.revision}});
  return {message:'操作已完成，执行记录已保存。'};
 });
 context.operations.register('connect',async(_input,invocation)=>{const session=await invocation.authentication.requestSession('business');return {message:'已连接 '+session.account.name};});
 context.operations.register('request',async()=>{const session=await context.authentication.getSession('business');if(!session)return {message:'请先连接企业账号。'};const result=await context.authentication.request({sessionId:session.id,path:'/tasks',method:'GET'});return {message:'业务服务返回 '+result.status+'：'+result.body.slice(0,2000)};});
};
