// Host-owned facade. No caller can supply a Profile, source identity or account scope.
class MessageService {
 constructor(database,{publish=()=>{},notify=()=>{}}={}){this.database=database;this.publish=publish;this.notify=notify;this.closed=false;}
 async host(method,input={}){if(this.closed)throw Error('HOST_UNAVAILABLE');const value=await this.database.call('messageHost',{method,input,locale:this.locale});if(['markRead','dismiss','bulk','setPreferences'].includes(method))this.publish();return value;}
 list(input){return this.host('list',input);}
 sources(){return this.host('sources');}
 markRead(input){return this.host('markRead',input);}
 dismiss(input){return this.host('dismiss',input);}
 bulk(input){return this.host('bulk',input);}
 setPreferences(input){return this.host('setPreferences',input);}
 async forExtension(context,method,input={}){if(this.closed)throw Error('HOST_UNAVAILABLE');const result=await this.database.call('extensionMessage',{id:context.id,generation:context.generation,method,input});if(['publish','update','withdraw','reportActionResult'].includes(method))this.publish();if(method==='publish')await this.remind(result);return result;}
 async execute(input,owner){
  if(this.closed||!this.router)throw Error('HOST_UNAVAILABLE');
  const call=(method,value)=>this.database.call('messageAction',{method,input:value});
  let record=await call('prepare',input);this.publish();
  const message={invocationId:record.id,messageId:record.messageId,actionId:record.snapshot.actionId};
  try{
   const result=await this.router.invoke(record.snapshot.commandId,record.snapshot.arguments||{},{caller:'page',extensionId:record.snapshot.extensionId,owner,message,
    validate:()=>record.state==='prepared'?call('validate',{invocationId:record.id}):undefined,
    onDispatch:async()=>{record=await call('dispatch',{invocationId:record.id,expectedRevision:record.revision});this.publish();}
   });
   record=await call('get',{invocationId:record.id});
   // Extensions report explicit business outcomes via messages.reportActionResult.
   // An ordinary successful handler return alone cannot prove business completion.
   if(record.state==='prepared')await call('cancel',{invocationId:record.id,expectedRevision:record.revision});
   else if(record.state==='dispatching')await call('unknown',{invocationId:record.id,expectedRevision:record.revision});
   return result;
  }finally{this.publish();}
 }
 async postSystem(input){if(this.closed)throw Error('HOST_UNAVAILABLE');const result=await this.database.call('messageSystem',{input});this.publish();await this.remind(result);return result;}
 async remind(result){if(result.status!=='published'||!result.remind||this.closed)return;try{const {items}=await this.list();const message=items.find(m=>m.id===result.id);if(!message||message.readAt!=null||message.validity!=='active')return;const source=(await this.sources()).find(s=>s.id===message.source);if(source?.preferences.receive&&!source.preferences.muted&&!this.closed)await this.notify(message);}catch{/* Notification delivery must never fail a persisted publication. */}}
 start(){if(this.timer||this.closed)return;this.timer=setInterval(()=>this.database.call('messageExpiry').then(count=>{if(count&&!this.closed)this.publish();}).catch(()=>{}),1000);this.timer.unref?.();}
 close(){this.closed=true;clearInterval(this.timer);this.timer=null;}
}
module.exports={MessageService};
