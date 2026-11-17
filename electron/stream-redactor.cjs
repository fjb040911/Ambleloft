// Only unconfirmed secret prefixes are withheld. No raw carry reaches UI/storage.
class StreamRedactor {
 constructor(keys=[]){
  this.keys=[...new Set((Array.isArray(keys)?keys:[keys]).filter(Boolean))].sort((a,b)=>b.length-a.length);
  this.tables=this.keys.map(key=>{const table=new Array(key.length).fill(0);for(let i=1,j=0;i<key.length;i++){while(j&&key[i]!==key[j])j=table[j-1];if(key[i]===key[j])j++;table[i]=j;}return table;});
  this.pattern=this.keys.length?new RegExp(this.keys.map(k=>k.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|'),'g'):null;
  this.carry='';this.scanned=0;
 }
 write(delta){
  const input=this.carry+String(delta||'');this.scanned+=input.length;if(!this.pattern)return input;
  let suffix=0;
  for(let k=0;k<this.keys.length;k++){const key=this.keys[k],table=this.tables[k];let j=0;for(let i=0;i<input.length;i++){while(j&&input[i]!==key[j])j=table[j-1];if(input[i]===key[j])j++;if(j===key.length)j=table[j-1];}suffix=Math.max(suffix,j);}
  const boundary=input.length-suffix;let at=0,match;const output=[];this.pattern.lastIndex=0;
  while((match=this.pattern.exec(input))&&match.index<boundary){output.push(input.slice(at,match.index),'[REDACTED]');at=match.index+match[0].length;}
  const end=Math.max(at,boundary);output.push(input.slice(at,end));this.carry=input.slice(end);return output.join('');
 }
 end(cancelled=false){const value=this.carry;this.carry='';return cancelled&&value?'[REDACTED]':value;}
}
// A context owns only active fields. Completion/replacement releases their carry.
class StreamFields {
 constructor(spool){this.spool=spool;this.fields=new Map();this.views=new Map();}
 append(owner,key,delta,secret,{limit,scope}={}){
  let fields=this.fields.get(owner);if(!fields){fields=new Map();this.fields.set(owner,fields);}
  const signature=JSON.stringify([...new Set((Array.isArray(secret)?secret:[secret]).filter(Boolean))].sort());let field=fields.get(key);
  if(field&&field.signature!==signature){this.emit(owner,key,field.redactor.end(true),field.limit);fields.delete(key);field=null;}
  if(!field){
   field={signature,redactor:new StreamRedactor(secret),limit,scope};fields.set(key,field);
   // A completed/replaced field can receive a late or resumed delta. Recheck only
   // its boundary so a previously flushed prefix cannot form an exposed key.
   const window=Math.max(0,...field.redactor.keys.map(value=>value.length-1));
   if(window){const spool=require('./text-spool.cjs'),ref=spool.reference(owner,key);if(ref&&this.spool){const offset=Math.max(0,ref.length-window),tail=spool.read(ref,offset),safe=field.redactor.write(tail);if(safe!==tail){const value=this.spool.create();for(const part of spool.chunks(ref,0,offset))this.spool.append(value,part);this.spool.append(value,safe);spool.install(owner,key,value);}}else{const previous=String(owner[key]||''),offset=Math.max(0,previous.length-window),tail=previous.slice(offset),safe=field.redactor.write(tail);if(safe!==tail)owner[key]=previous.slice(0,offset)+safe;}}
  }
  this.emit(owner,key,field.redactor.write(delta),limit);
 }
 emit(owner,key,value,limit){if(!value)return;if(this.spool&&!limit){require('./text-spool.cjs').append(owner,key,value,this.spool);return;}const text=(owner[key]||'')+value;owner[key]=limit?text.slice(-limit):text;}
 flush(owner,key,cancelled=false){const field=this.fields.get(owner)?.get(key);if(field)this.emit(owner,key,field.redactor.end(cancelled),field.limit);this.reset(owner,key);}
 reset(owner,key){const fields=this.fields.get(owner);if(key===undefined)this.fields.delete(owner);else{fields?.delete(key);if(!fields?.size)this.fields.delete(owner);}}
 join(owner,key,read,scope,parts){
  if(this.spool&&parts){require('./text-spool.cjs').joined(owner,key,parts);return;}
  const views=this.views.get(owner)||new Map();this.views.set(owner,views);views.set(key,{read,scope});
  Object.defineProperty(owner,key,{enumerable:true,configurable:true,get:read,set(value){Object.defineProperty(this,key,{value,writable:true,enumerable:true,configurable:true});}});
 }
 finish(cancelled=false,scope){
  for(const [owner,fields] of this.fields){for(const [key,field] of fields)if(scope===undefined||field.scope===scope){this.emit(owner,key,field.redactor.end(cancelled),field.limit);fields.delete(key);}if(!fields.size)this.fields.delete(owner);}
  for(const [owner,views] of this.views){for(const [key,view] of views)if(scope===undefined||view.scope===scope){const descriptor=Object.getOwnPropertyDescriptor(owner,key);if(descriptor?.get===view.read)owner[key]=view.read();views.delete(key);}if(!views.size)this.views.delete(owner);}
 }
}
const fields=context=>{const value=context.streamFields??=new StreamFields(context.textSpool);value.spool??=context.textSpool;return value;};
function secrets(context){context.streamSecrets??=new Set();for(const key of [context.config?.apiKey,context.bridge?.config?.apiKey])if(key)context.streamSecrets.add(key);return [...context.streamSecrets].sort();}
function cleanText(context,value){let text=String(value||'');for(const key of secrets(context).sort((a,b)=>b.length-a.length))text=text.split(key).join('[REDACTED]');return text;}
module.exports={StreamRedactor,StreamFields,fields,secrets,cleanText};
