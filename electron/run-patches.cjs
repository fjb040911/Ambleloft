const {randomUUID}=require('node:crypto');
const collections=['messages','tools','plans','fileChanges','artifacts','taskApps','approvals','questions','modelRequests'];
const threshold=8192;
const reasoningFields=['text','summary','content'];
function clearedReasoning(message){
 // Copy descriptors so other lazy text fields keep their original references.
 const next={};
 for(const key of Object.keys(message)){
  if(key==='text')next.text='';
  else if(!reasoningFields.includes(key))Object.defineProperty(next,key,Object.getOwnPropertyDescriptor(message,key));
 }
 next.reasoningCleared=true;
 return next;
}
const {reference,digest}=require('./runtime-text-cache.cjs');
// Keep strings by reference, not a second serialized copy of the complete run.
function splitItem(item){
 const texts=new Map();
 const keep=(path,ref)=>{if(ref.kind==='joined'&&!ref.hash){const hash=require('node:crypto').createHash('sha256');for(const chunk of require('./text-spool.cjs').chunks(ref))hash.update(chunk,'utf16le');ref.hash=hash.digest('hex');}texts.set(JSON.stringify(path),ref);};
 function visit(value,path){
  if(typeof value==='string'&&path.length&&value.length>threshold){texts.set(JSON.stringify(path),value);return '';}
  if(Array.isArray(value))return Array.from({length:value.length},(_,i)=>{const ref=reference(value,String(i));if(ref){keep([...path,i],ref);return '';}return visit(value[i],[...path,i]);});
  if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).map(k=>{const ref=reference(value,k);if(ref){keep([...path,k],ref);return [k,''];}return [k,visit(value[k],[...path,k])];}));
  return value;
 }
 return {data:JSON.stringify(visit(item,[])),texts};
}
function createRunPatches(){
 const saved=new Map();
 return {
  capture(runs,hints){
   return runs.map(run=>{
    if(run.originHandoff)return {id:run.id,managed:true};
    const meta={...run};for(const name of collections)delete meta[name];
    const hint=hints?.get(run.id),partial=saved.has(run.id)&&hint instanceof Set,entries=[],seen=[];let turnKey=null;
    for(const collection of collections)for(const [position,item] of (run[collection]||[]).entries()){
     if(collection==='messages'&&item.role==='user'&&!item.turnKey)turnKey=item.id;
     const key=String(collection==='modelRequests'?(item.requestId||position):(item.id||item.turnKey||position)),lookup=JSON.stringify([collection,key]);seen.push(lookup);
     if(partial&&!hint.has(lookup))continue;
     entries.push({collection,key,lookup,position,turnKey:item.turnKey||(collection==='messages'?turnKey:null),value:splitItem(item),source:item});
    }
    return {id:run.id,metadata:JSON.stringify(meta),partial,entries,seen,source:run};
   });
  },
  prepare(runs,options={}){return this.prepareCaptured(this.capture(runs,options.hints),options);},
  prepareCaptured(runs,{replace=false,terminal,start}={}){
   const next=new Map(saved),patches=[];
   for(const run of runs){
    if(run.managed)continue;
    const {metadata,partial}=run,seen=new Set(run.seen),previous=saved.get(run.id),inventory=new Map(previous?.items||[]),upserts=[],deletes=[];
    if(partial&&!previous)throw Error('RUN_BASELINE_CHANGED');
    for(const entry of run.entries){
     const {collection,key,lookup,position,turnKey:itemTurn,value}=entry,before=previous?.items.get(lookup),texts=[];
     const signatures=new Map();
     for(const [field,text] of value.texts){
      const old=before?.texts.get(field);
      if(typeof text!=='string'&&['spool','joined'].includes(text.kind)){
       const signature={length:text.length,hash:text.hash,generation:text.generation,revision:text.revision,source:text};signatures.set(field,signature);
       if(old?.hash&&old.hash===text.hash||old?.revision===text.revision)continue;
       const append=old?.source?require('./text-spool.cjs').prefix(old.source,text):!!text.generation&&old?.generation===text.generation&&old.length<=text.length;
       texts.push({field,mode:append?'append':'set',baseLength:append?old.length:0,source:text,start:append?old.length:0});continue;
      }
      if(typeof text!=='string'){
       if(!old||old.revision!==text.revision&&(!old.hash||old.hash!==text.hash))throw Error('TEXT_BASELINE_CHANGED');
       signatures.set(field,old);continue;
      }
      const signature={length:text.length,hash:digest(text)};signatures.set(field,signature);
      if(old?.length===text.length&&old.hash===signature.hash)continue;
      // Compare the acknowledged prefix by digest; never retain the full prefix.
      const append=!!old?.hash&&text.length>=old.length&&digest(text.slice(0,old.length))===old.hash;
      texts.push({field,mode:append?'append':'set',baseLength:append?old.length:0,text:append?text.slice(old.length):text});
     }
     const removed=[...(before?.texts.keys()||[])].filter(field=>!value.texts.has(field));
     if(!before||before.data!==value.data||before.position!==position||before.turnKey!==itemTurn||texts.length||removed.length)upserts.push({collection,key,position,turnKey:itemTurn,data:value.data,texts,removed,resetTexts:!before});
     inventory.set(lookup,{data:value.data,texts:signatures,position,turnKey:itemTurn});
    }
    if(!partial)for(const key of inventory.keys())if(!seen.has(key)){deletes.push(JSON.parse(key));inventory.delete(key);}
    if(!previous||previous.meta!==metadata||upserts.length||deletes.length){
     patches.push({id:run.id,meta:metadata,upserts,deletes,...(!previous?{keepItems:[...seen]}:{})});next.set(run.id,{meta:metadata,items:inventory});
    }
   }
   const keep=replace?runs.map(r=>r.id):undefined;
   if(keep)for(const id of next.keys())if(!keep.includes(id))next.delete(id);
   const input={mutationId:randomUUID(),patches,keep,terminal,start};
   return {input,commit(){saved.clear();for(const [id,value] of next)saved.set(id,value);}};
  },
  seed(runs,legacy=[]){
   saved.clear();
   for(const run of this.capture(runs.filter(run=>!legacy.includes(run.id)))){if(run.managed)continue;const items=new Map();for(const entry of run.entries)items.set(entry.lookup,{data:entry.value.data,position:entry.position,turnKey:entry.turnKey,texts:new Map([...entry.value.texts].map(([field,text])=>[field,typeof text==='string'?{length:text.length,hash:digest(text)}:{length:text.length,revision:text.revision,hash:text.hash}]))});saved.set(run.id,{meta:run.metadata,items});}
  },
  acknowledgeReasoning(updates){
   for(const {id,messages,evidence} of updates){
    const record=saved.get(id);
    if(!record)continue;
    for(const key of messages){
     const item=record.items.get(JSON.stringify(['messages',key]));
     if(!item)continue;
     item.data=JSON.stringify(clearedReasoning(JSON.parse(item.data)));
     for(const field of item.texts.keys())if(reasoningFields.includes(JSON.parse(field)[0]))item.texts.delete(field);
    }
    if(evidence)record.meta=JSON.stringify({...JSON.parse(record.meta),reasoningEvidence:evidence});
   }
  },
  clear(){saved.clear();},
 };
}
module.exports={createRunPatches,collections,splitItem,reasoningFields,clearedReasoning};
