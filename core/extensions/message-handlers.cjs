const {failure}=require('./errors.cjs');
// Only registered on the private main-process -> database worker channel.
function createMessageHandlers(db,messages,actions,transaction=fn=>fn()){
 let systemLocale='en';
 const profile=()=>{const row=db.prepare("SELECT data FROM settings WHERE key='extensions.profile'").get();if(!row)throw failure('HOST_UNAVAILABLE','HOST_UNAVAILABLE: Profile');return JSON.parse(row.data);};
 const scope=source=>({profileId:profile(),source,accountScope:'local'});
 const sourceKey=id=>'extension:'+id;
 const sources=()=>{const setting=JSON.parse(db.prepare("SELECT data FROM settings WHERE key='workspace'").get()?.data||'{}');const locale=setting.language&&setting.language!=='system'?setting.language:systemLocale;const result=new Map([['host',{id:'host',name:'AmbleLoft',installed:true}]]);for(const r of db.prepare('SELECT id,data FROM extension_installations').all()){const i=JSON.parse(r.data);result.set(sourceKey(i.id),{id:sourceKey(i.id),name:require('./localization.cjs').localized(i,i.manifest?.displayName||i.manifest?.name,locale)||i.id,installed:true,enabled:i.enabled});}for(const r of db.prepare('SELECT DISTINCT scope FROM notification_records').all()){const [p,s,a]=JSON.parse(r.scope);if(p===profile()&&a==='local'&&!result.has(s))result.set(s,{id:s,name:s,installed:false,enabled:false});}return [...result.values()].map(s=>({...s,preferences:messages.getPreferences(scope(s.id))}));};
 const requireSource=id=>{if(typeof id!=='string'||!sources().some(s=>s.id===id))throw failure('NOT_FOUND','NOT_FOUND: Source');return scope(id);};
 const filter=input=>{const value=input.filter??'all';if(!['all','unread','pending'].includes(value))throw failure('INVALID_ARGUMENT','INVALID_ARGUMENT');return value;};
 const find=id=>{if(typeof id!=='string')throw failure('INVALID_ARGUMENT','INVALID_ARGUMENT');for(const s of sources()){const c=scope(s.id);const m=messages.list(c).find(m=>m.id===id);if(m)return {c,m};}throw failure('NOT_FOUND','NOT_FOUND');};
 const projection=m=>{if(m.suppressed||m.dismissedAt!=null)return null;const {readAt,dismissedAt,suppressed,...rest}=m;return rest;};
 const extension=context=>{const row=db.prepare('SELECT data FROM extension_installations WHERE id=?').get(context.id);const item=row&&JSON.parse(row.data);if(!item||item.kind!=='package'||!item.trusted||!item.enabled||item.generation!==context.generation)throw failure('FORBIDDEN','FORBIDDEN');return scope(sourceKey(item.id));};
 const key=c=>JSON.stringify([c.profileId,c.source,c.accountScope]);
 const validateActions=(input,c)=>{for(const a of input.actions||[]){const id=c?.source?.slice(10),row=id&&db.prepare('SELECT data FROM extension_installations WHERE id=?').get(id),item=row&&JSON.parse(row.data);const op=item?.manifest?.operations?.find(op=>op.id===a.commandId);if(!actions||!op||!op.exposeTo.includes('page'))throw failure('UNSUPPORTED','UNSUPPORTED: Action operation');if(Object.keys(a).some(k=>!['id','label','commandId','arguments'].includes(k))||a.arguments!==undefined&&(!a.arguments||typeof a.arguments!=='object'||Array.isArray(a.arguments)))throw failure('INVALID_ARGUMENT','INVALID_ARGUMENT');}};
 const publicInvocation=m=>{const {scope,snapshot,...rest}=m;return {...rest,actionId:snapshot.actionId,operationId:snapshot.commandId,effect:snapshot.effect};};
 const actionState=(c,m)=>{const records=actions?.list(key(c)).filter(r=>r.messageId===m.id)||[];return records.map(publicInvocation);};
 const report=(c,input)=>{const result=actions.report(key(c),input,(invocation,update)=>{validateActions(update.patch||{},c);return projection(messages.update(c,invocation.messageId,update.patch,update.expectedRevision));});return {...result,invocation:publicInvocation(result.invocation)};};
 return {
  messageHost({method,input={},locale}){if(typeof locale==='string')systemLocale=locale;if(!input||typeof input!=='object'||Array.isArray(input))throw failure('INVALID_ARGUMENT','INVALID_ARGUMENT');
   if(method==='sources')return sources();
   if(method==='list'){const f=filter(input),selected=input.source?[{id:requireSource(input.source).source}]:sources();let unread=0;const items=[];for(const s of selected){const c=scope(s.id),all=messages.list(c);unread+=all.filter(m=>m.readAt==null).length;for(const m of messages.list(c,{filter:f}))items.push({...m,source:s.id,actions:m.actions.map(a=>{const row=db.prepare('SELECT data FROM extension_installations WHERE id=?').get(s.id.slice(10)),item=row&&JSON.parse(row.data);return {...a,effect:item?.manifest?.operations?.find(op=>op.id===a.commandId)?.effect||'write'};}),executions:actionState(c,m)});}items.sort((a,b)=>b.receivedAt-a.receivedAt||a.id.localeCompare(b.id));return {items,unread};}
   if(method==='setPreferences')return messages.setPreferences(requireSource(input.source),input.preferences);
   if(method==='markRead'||method==='dismiss'){const {c}=find(input.id);return messages[method](c,input.id);}
   if(method==='bulk'){const f=filter(input);if(!['read','clearRead'].includes(input.action))throw failure('INVALID_ARGUMENT','INVALID_ARGUMENT');const selected=input.source?[{id:requireSource(input.source).source}]:sources();let count=0;for(const s of selected)count+=messages.bulk(scope(s.id),{filter:f,action:input.action}).count;return {count};}
   throw failure('UNSUPPORTED','UNSUPPORTED');
  },
  extensionMessage(context){const c=extension(context),{method,input={}}=context;if(!input||typeof input!=='object'||Array.isArray(input))throw failure('INVALID_ARGUMENT','INVALID_ARGUMENT');if(Object.keys(input).some(k=>['profileId','source','accountScope'].includes(k)))throw failure('FORBIDDEN','FORBIDDEN: Host-bound identity');
   if(method==='getPreferences')return messages.getPreferences(c);
   if(method==='listActionInvocations')return actions.list(key(c)).filter(m=>['accepted','unknown','dispatching'].includes(m.state)).map(publicInvocation);
   if(method==='reportActionResult')return report(c,input);
   if(method==='publish'){validateActions(input,c);return messages.publish(c,input);}
   if(method==='getByEventKey'){if(typeof input.eventKey!=='string')throw failure('INVALID_ARGUMENT','INVALID_ARGUMENT');const row=db.prepare('SELECT id FROM notification_records WHERE scope=? AND event_key=?').get(JSON.stringify([c.profileId,c.source,c.accountScope]),input.eventKey);return row?projection(messages.get(c,row.id)):null;}
   if(method==='update'){validateActions(input.patch||{},c);return projection(messages.update(c,input.id,input.patch,input.expectedRevision));}
   if(method==='withdraw')return projection(messages.update(c,input.id,{validity:'withdrawn'},input.expectedRevision));
   throw failure('UNSUPPORTED','UNSUPPORTED');
  },
  messageAction({method,input={}}){
   if(method==='prepare')return transaction(()=>{const {c,m}=find(input.messageId);if(m.revision!==input.expectedRevision)throw failure('CONFLICT','CONFLICT');if(m.validity!=='active'||m.businessState==='resolved'||!messages.getPreferences(c).receive)throw failure('FORBIDDEN','FORBIDDEN');const action=m.actions.find(a=>a.id===input.actionId);if(!action)throw failure('NOT_FOUND','NOT_FOUND');const id=c.source.slice(10),row=db.prepare('SELECT data FROM extension_installations WHERE id=?').get(id),item=row&&JSON.parse(row.data);extension({id,generation:item?.generation});validateActions({actions:[action]},c);const operation=item.manifest.operations.find(op=>op.id===action.commandId);return actions.prepare({scope:key(c),messageId:m.id,snapshot:{...action,actionId:action.id,extensionId:id,generation:item.generation,effect:operation.effect,messageRevision:m.revision}});});
   const record=actions.get(input.invocationId);const [p,source,accountScope]=JSON.parse(record.scope);if(p!==profile()||accountScope!=='local')throw failure('FORBIDDEN','FORBIDDEN');const c=scope(source);
   if(method==='get')return record;
   if(method==='validate'){const m=messages.get(c,record.messageId);extension({id:record.snapshot.extensionId,generation:record.snapshot.generation});if(m.revision!==record.snapshot.messageRevision||m.validity!=='active'||m.businessState==='resolved'||m.dismissedAt!=null||!messages.getPreferences(c).receive)throw failure('CONFLICT','CONFLICT');return null;}
   if(method==='dispatch')return transaction(()=>{const m=messages.get(c,record.messageId);extension({id:record.snapshot.extensionId,generation:record.snapshot.generation});if(m.revision!==record.snapshot.messageRevision||m.validity!=='active'||m.businessState==='resolved'||m.dismissedAt!=null||!messages.getPreferences(c).receive)throw failure('CONFLICT');return actions.dispatch(record.id,input.expectedRevision);});
   if(method==='cancel')return actions.cancelBeforeDispatch(record.id,input.expectedRevision);
   if(method==='unknown')return actions.unknown(record.id,input.expectedRevision);
   if(method==='report')return report(c,input.report);
   throw failure('UNSUPPORTED','UNSUPPORTED');
  },
  messageSystem({input}){validateActions(input);return messages.publish(scope('host'),input);},
  messageExpiry(){let count=0;for(const row of db.prepare('SELECT scope,id,data FROM notification_records').all()){const m=JSON.parse(row.data);if(m.validity==='active'&&m.expiresAt!=null&&m.expiresAt<=Date.now()){const [profileId,source,accountScope]=JSON.parse(row.scope);messages.get({profileId,source,accountScope},row.id);count++;}}return count;},
 };
}
module.exports={createMessageHandlers};
