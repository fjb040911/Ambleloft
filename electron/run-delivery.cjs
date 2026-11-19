const {randomUUID}=require('node:crypto');
const {packets}=require('./stream-json.cjs');
const {retainedBytes}=require('./run-events.mjs');
const maxPendingDeltaBytes=1024*1024;
const maxAcknowledgedRuns=64;
const follows=(event,base)=>event?.kind==='run-delta'&&base?.epoch===event.epoch&&base?.revision===event.baseRevision;

// One credited packet per renderer. Queue at most one bounded delta per run;
// if an intermediate revision is lost, recover from the latest snapshot.
class RunDelivery {
 constructor(send,snapshot){
  this.send=send;this.snapshot=snapshot;this.pending=new Map();this.acknowledged=new Map();
  this.pendingDeltaBytes=0;this.current=null;this.ready=false;this.closed=false;this.sentBytes=0;this.coalesced=0;
 }
 push(event){
  if(this.closed)return;
  const id=event.id||event.run?.id;if(!id)return;
  if(this.current||!this.ready){
   if(this.pending.has(id))this.coalesced++;
   this.pendingDeltaBytes-=this.pending.get(id)?.bytes||0;
   const base=this.current?.runId===id?this.current.version:this.acknowledged.get(id);
   let queued;
   if(this.ready&&follows(event,base)){
    const bytes=retainedBytes(event);
    if(this.pendingDeltaBytes+bytes<=maxPendingDeltaBytes){queued={event,bytes};this.pendingDeltaBytes+=bytes;}
   }
   this.pending.set(id,queued);
   return;
  }
  const next=event.kind==='run-snapshot'||follows(event,this.acknowledged.get(id))?event:this.snapshot(id);
  if(next)this.start(id,next);
 }
 start(runId,event){
  const {epoch,revision}=event;
  this.current={runId,version:{epoch,revision},id:randomUUID(),seq:0,iterator:packets(event),done:false};
  this.next();
 }
 next(){
  const c=this.current;if(!c)return;
  const part=c.iterator.next();c.done=part.done;const data=part.value||Buffer.alloc(0);
  c.bytes=data.length;c.sentAt=performance.now();this.sentBytes+=data.length;
  this.send({id:c.id,seq:c.seq,data,done:c.done});
 }
 ack({id,seq}={}){
  const c=this.current;if(!c||c.id!==id||c.seq!==seq)return;
  if(c.cancelled){c.iterator.return?.();this.current=null;this.drain();return;}
  if(!c.done){c.seq++;this.next();return;}
  this.acknowledged.delete(c.runId);this.acknowledged.set(c.runId,c.version);
  if(this.acknowledged.size>maxAcknowledgedRuns)this.acknowledged.delete(this.acknowledged.keys().next().value);
  this.current=null;this.drain();
 }
 drain(){
  while(this.ready&&!this.closed&&!this.current&&this.pending.size){
   const [id,queued]=this.pending.entries().next().value;
   this.pending.delete(id);this.pendingDeltaBytes-=queued?.bytes||0;
   const event=follows(queued?.event,this.acknowledged.get(id))?queued.event:this.snapshot(id);
   if(event)this.start(id,event);
  }
 }
 forget(id){
  this.pendingDeltaBytes-=this.pending.get(id)?.bytes||0;
  this.pending.delete(id);this.acknowledged.delete(id);
  if(this.current?.runId===id)this.current.cancelled=true;
 }
 reset(){
  if(this.closed)return;
  const c=this.current;
  if(c){if(!c.cancelled)this.pending.set(c.runId,undefined);c.iterator.return?.();this.current=null;}
  this.acknowledged.clear();
  for(const id of this.pending.keys())this.pending.set(id,undefined);
  this.pendingDeltaBytes=0;this.ready=true;this.drain();
 }
 close(){
  this.closed=true;this.current?.iterator.return?.();this.current=null;
  this.pending.clear();this.acknowledged.clear();this.pendingDeltaBytes=0;
 }
 stats(){return {inFlightBytes:this.current?.bytes||0,awaitingAckMs:this.current?Math.round(performance.now()-this.current.sentAt):0,pendingRuns:this.pending.size,sentBytes:this.sentBytes,coalesced:this.coalesced};}
}
module.exports={RunDelivery};
