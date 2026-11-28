const {pageRun,previewMessage,summary,saveView}=require('./history-pages.cjs');
const {previewTool}=require('./tool-previews.cjs');
const {projectionVersion}=require('./runtime-text-cache.cjs');
const {createRunPublisher}=require('./run-events.mjs');

const collections=['messages','tools','plans','artifacts','fileChanges','taskApps','approvals','questions'];
const previews={messages:previewMessage,tools:previewTool};

function projectChanges(run, previous, items){
 const {modelRequests,...view}=saveView(run);
 for(const name of collections)view[name]=previous[name];
 const copies=new Set();
 for(const key of items){
  const [name,id]=JSON.parse(key);
  if(!Object.hasOwn(previews,name)||typeof id!=='string')return;
  const item=run[name]?.findLast(item=>item.id===id);
  const index=previous[name]?.findLastIndex(item=>item.id===id)??-1;
  if(!item||index<0||item.turnKey!==previous[name][index].turnKey)return;
  if(!copies.has(name)){view[name]=previous[name].slice();copies.add(name);}
  view[name][index]=previews[name](item);
 }
 return {...view,summaryOnly:false,historyBefore:previous.historyBefore,turnOffset:previous.turnOffset,totalTurns:previous.totalTurns};
}

function createRunPublication({epoch,findRun,windows,project=pageRun}){
 const publisher=createRunPublisher(epoch);
 const published=new WeakMap();
 let fullProjections=0,incrementalProjections=0,skippedStreams=0;
 function encode(run,items){
  const current=publisher.snapshot(run.id),prior=published.get(run);
  const version=projectionVersion(run);
  // Hints describe content-only changes. Structural edits and storage
  // compaction can invalidate the page even when no streamed ID changed.
  const canPatch=items?.size&&current&&prior?.revision===current.revision&&prior.version===version&&
   collections.every((name,index)=>run[name]===prior.collections[index]&&run[name]?.length===prior.lengths[index]);
  const next=canPatch?projectChanges(run,current.run,items):undefined;
  if(next)incrementalProjections++;
  else fullProjections++;
  const event=publisher.encode(next||project(run));
  published.set(run,{revision:event.revision,version,collections:collections.map(name=>run[name]),lengths:collections.map(name=>run[name]?.length)});
  return event;
 }
 function snapshot(id){
  const run=findRun(id);if(!run)return;
  const current=publisher.snapshot(id),prior=published.get(run);
  if(current&&prior?.revision===current.revision&&prior.version===projectionVersion(run))return current;
  publisher.forget(id);
  return encode(run);
 }
 return {
  snapshot,
  publish(run,items){
   let event,brief,watched=false;
   for(const record of windows()){
    if(record.runDetails.has(run.id)){
     watched=true;
     event??=encode(run,items);
     record.delivery.push(event);
    }else if(!items?.size){
     brief??={...summary(run),approvals:run.approvals||[],questions:run.questions};
     record.window.webContents.send('agent:event',brief);
    }
   }
   if(!watched){
    // A later subscriber must start from the live run, not the old snapshot.
    published.delete(run);
    if(items?.size)skippedStreams++;
   }
  },
  subscribe(record,ids){
   const previous=record.runDetails;
   record.runDetails=new Set(ids);
   for(const id of previous)if(!record.runDetails.has(id))record.delivery?.forget(id);
   for(const id of record.runDetails)if(!previous.has(id)){
    const event=snapshot(id);
    if(event)record.delivery.push(event);
   }
  },
  stats(){return {...publisher.stats(),fullProjections,incrementalProjections,skippedStreams};}
 };
}
module.exports={createRunPublication};
