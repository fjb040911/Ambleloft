// A follow-up retires the reminder, not the historical RPC record. The model
// still decides whether the supplied information is sufficient for the task.
export function interruptedQuestion(messages, currentMessageId) {
 const index=messages.findLastIndex(message=>message.inputRecord);
 const record=messages[index];
 if(record?.inputRecord?.state!=='pending')return undefined;
 const supplied=messages.slice(index+1).some(message=>{
  if(message.role!=='user'||message.formSubmissionId)return false;
  if(message.inputDeliveryState&&message.inputDeliveryState!=='delivered'&&message.id!==currentMessageId)return false;
  const text=(message.text||'').trim();
  return text.length>0&&!/^(继续(?:任务|执行|这个任务)?|请继续|继续吧|continue|resume|go on)[\s.!！。]*$/iu.test(text);
 });
 return supplied?undefined:record;
}
