const collections=['messages','tools','plans','artifacts','fileChanges','taskApps','approvals','questions'];
const equal=(a,b)=>a===b||JSON.stringify(a)===JSON.stringify(b);
const key=(item,index)=>String(item.id??item.turnKey??index);
function changes(before,after){
 const set={},append={},remove=[];
 for(const name of Object.keys(before))if(!(name in after))remove.push(name);
 for(const [name,value] of Object.entries(after))if(!equal(before[name],value)){
  const old=before[name];
  if(typeof old==='string'&&typeof value==='string'&&old.length>128&&value.startsWith(old))append[name]={length:old.length,text:value.slice(old.length)};
  else set[name]=value;
 }
 return {set,append,remove};
}
function applyFields(before,patch){
 const next={...before,...patch.set};
 for(const name of patch.remove)delete next[name];
 for(const [name,part] of Object.entries(patch.append)){
  if(typeof before[name]!=='string'||before[name].length!==part.length)throw Error('Invalid text delta');
  next[name]=before[name]+part.text;
 }
 return next;
}
const sizes=new WeakMap();
// Immutable snapshots share unchanged objects, so sizing also shares cached work.
export function retainedBytes(value){if(typeof value==='string')return value.length*2+16;if(!value||typeof value!=='object')return 8;const known=sizes.get(value);if(known!==undefined)return known;let size=64;for(const key of Object.keys(value))size+=key.length*2+retainedBytes(value[key]);sizes.set(value,size);return size;}
export function createRunPublisher(epoch,{maxBytes=16*1024*1024,maxEntries=64}={}){
 const records=new Map(),revisions=new Map();let bytes=0;
 const forget=id=>{const old=records.get(id);if(old)bytes-=retainedBytes(old);records.delete(id);};
 const remember=(id,snapshot)=>{forget(id);const size=retainedBytes(snapshot);if(size>maxBytes)return;while(records.size&&(bytes+size>maxBytes||records.size>=maxEntries))forget(records.keys().next().value);records.set(id,snapshot);bytes+=size;};
 return {
  encode(run){
   const old=records.get(run.id),revision=(revisions.get(run.id)||0)+1;revisions.set(run.id,revision);
   // Snapshot the projected view: the runtime continues mutating its own records.
   if(!old){const snapshot=structuredClone({kind:'run-snapshot',epoch,revision,run});remember(run.id,snapshot);return snapshot;}
   const before={...old.run},after={...run},arrays={};
   for(const name of collections){
    delete before[name];delete after[name];
    if(equal(old.run[name],run[name]))continue;
    if(!Array.isArray(run[name])){arrays[name]={value:run[name]??null};continue;}
    const prior=new Map((old.run[name]||[]).map((item,index)=>[key(item,index),item]));
    arrays[name]={order:run[name].map(key),items:run[name].flatMap((item,index)=>{
     const id=key(item,index),previous=prior.get(id);
     return equal(previous,item)?[]:[{id,...(previous?{patch:changes(previous,item)}:{value:item})}];
    })};
   }
   const event=structuredClone({kind:'run-delta',id:run.id,epoch,baseRevision:old.revision,revision,fields:changes(before,after),arrays});
   remember(run.id,applyRunEvent(old,event));return event;
  },
  snapshot(id){return records.get(id);},
  forget,
  stats(){return {bytes,entries:records.size,maxBytes};}
 };
}
export function applyRunEvent(current,event){
 if(event.kind==='run-snapshot'){
  if(current?.epoch===event.epoch&&current.revision>=event.revision)return current;
  return event;
 }
 if(!current||event.epoch!==current.epoch||event.baseRevision!==current.revision)throw Error('Run revision gap');
 let run=applyFields(current.run,event.fields);
 for(const [name,change] of Object.entries(event.arrays)){
  if('value' in change){run[name]=change.value??undefined;continue;}
  const prior=new Map((current.run[name]||[]).map((item,index)=>[key(item,index),item]));
  for(const item of change.items)prior.set(item.id,'value' in item?item.value:applyFields(prior.get(item.id)||{},item.patch));
  run[name]=change.order.map(id=>{if(!prior.has(id))throw Error('Missing run item');return prior.get(id);});
 }
 return {kind:'run-snapshot',epoch:event.epoch,revision:event.revision,run};
}
