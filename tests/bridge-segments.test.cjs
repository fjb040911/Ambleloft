const test=require('node:test'),assert=require('node:assert/strict');
const {apply,segment}=require('../electron/bridge-segments.cjs');
const {TextSpool,reference,prefix}=require('../electron/text-spool.cjs');
const {fields}=require('../electron/stream-redactor.cjs');
const group='msg_resp_12345678-1234-1234-1234-123456789abc';
const message=(method,n,extra={})=>({method,params:{threadId:'thread',itemId:group+'_part_'+n,...extra}});
test('many bridge segments share a bounded visible message and preserve append references',t=>{
 const spool=new TextSpool();t.after(()=>spool.close());const context={textSpool:spool},owner={text:''};let expected='';
 for(let n=0;n<100;n++){
  const text=(n+' 中文😀\n"\\').repeat(1000);expected+=text;
  apply(context,message('item/agentMessage/delta',n,{delta:text}),owner,'text');
  const before=reference(owner,'text');
  apply(context,message('item/completed',n,{item:{id:group+'_part_'+n,type:'agentMessage',text}}),owner,'text');
  assert.equal(reference(owner,'text').revision,before.revision);
  if(n<99){apply(context,message('item/started',n+1),owner,'text');assert.ok(prefix(before,reference(owner,'text')));}
 }
 assert.equal(owner.text,expected);assert.equal(context.bridgeSegments.size,1);assert.equal(fields(context).fields.size,0);
 // Authoritative completion changes only its own segment, and duplicate/late
 // events cannot append the same segment twice.
 apply(context,message('item/completed',99,{item:{type:'agentMessage',text:'replacement'}}),owner,'text');
 apply(context,message('item/agentMessage/delta',99,{delta:'late'}),owner,'text');
 assert.equal(owner.text,expected.slice(0,-('99 中文😀\n"\\'.repeat(1000)).length)+'replacement');
});
test('segment boundaries do not expose secret prefixes or coalesce native item IDs',()=>{
 const context={config:{apiKey:'synthetic-secret'}},owner={text:''};
 apply(context,message('item/agentMessage/delta',0,{delta:'synthetic-'}),owner,'text');assert.equal(owner.text,'');
 apply(context,message('item/completed',0,{item:{type:'agentMessage',text:'synthetic-'}}),owner,'text');
 apply(context,message('item/completed',1,{item:{type:'agentMessage',text:'secret'}}),owner,'text');
 assert.equal(owner.text,'[REDACTED]secret');assert.equal(segment({method:'item/completed',params:{item:{id:'native-message'}}}),undefined);
});

test('stopping a short segment publishes its redacted carry to the visible body',()=>{
 const context={config:{apiKey:'synthetic-secret'}},owner={text:''};
 apply(context,message('item/agentMessage/delta',0,{delta:'safe synthetic-'}),owner,'text');
 assert.equal(owner.text,'safe ');fields(context).finish(true);
 assert.equal(owner.text,'safe [REDACTED]');
});

test('short segments spill into one append-only body instead of retaining all closed text',t=>{
 const spool=new TextSpool();t.after(()=>spool.close());const context={textSpool:spool},owner={text:''};let expected='';
 for(let n=0;n<1000;n++){
  const text='short 中文😀 '+n+'\n';expected+=text;
  apply(context,message('item/agentMessage/delta',n,{delta:text}),owner,'text');
  apply(context,message('item/completed',n,{item:{type:'agentMessage',text}}),owner,'text');
 }
 assert.equal(owner.text,expected);assert.equal(spool.stats().files,1);
 const entries=[...context.bridgeSegments.values()][0].segments;
 assert.ok([...entries.values()].every(entry=>Object.values(entry).every(v=>typeof v!=='string')));
 Object.defineProperty(owner,'text',{configurable:true,enumerable:true,get(){throw Error('compacted history must not be hydrated');}});
 apply(context,message('item/completed',0,{item:{type:'agentMessage',text:'corrected'}}),owner,'text');
 assert.equal(owner.text,'corrected'+expected.slice('short 中文😀 0\n'.length));
 apply(context,message('item/completed',999,{item:{type:'agentMessage',text:'last'}}),owner,'text');
 assert.ok(owner.text.endsWith('last'));
});

test('native child segments retain one answer and one reasoning activity, ignoring stale turns',()=>{
 const {NativeSubagents}=require('../electron/native-subagents.cjs');
 const child={id:'child',status:'running',nativeTurnId:'current'},context={run:{threadId:'parent'},nativeThreads:new Map([['thread',child]])};
 const native=new NativeSubagents({changed(){}});
 for(let n=0;n<10;n++)native.notification(context,message('item/completed',n,{turnId:'current',item:{type:'agentMessage',text:String(n)}}));
 assert.equal(child.detail,'0123456789');assert.equal(Object.keys(child.nativeMessages).length,1);
 const reasoning=message('item/reasoning/textDelta',0,{delta:'thought',turnId:'current'});reasoning.params.itemId=reasoning.params.itemId.replace('msg_','rs_');native.notification(context,reasoning);
 assert.equal(child.nativeActivity.length,1);assert.equal(child.nativeActivity[0].text,'thought');assert.equal(child.nativeActivity[0].type,'reasoning');
 native.notification(context,message('item/agentMessage/delta',99,{turnId:'old',delta:'stale'}));assert.equal(child.detail,'0123456789');
});
