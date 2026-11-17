const {randomUUID}=require('node:crypto');
const {packets}=require('./stream-json.cjs');
// One credited frame per renderer. While blocked retain run IDs, never event bodies.
class RunDelivery {
 constructor(send,snapshot){this.send=send;this.snapshot=snapshot;this.pending=new Set();this.current=null;this.ready=false;this.closed=false;this.sentBytes=0;this.coalesced=0;}
 push(event){if(this.closed)return;const id=event.id||event.run?.id;if(!id)return;if(this.current||!this.ready){if(this.pending.has(id))this.coalesced++;this.pending.add(id);return;}this.start(id,event);}
 start(runId,event){this.current={runId,id:randomUUID(),seq:0,iterator:packets(event),done:false};this.next();}
 next(){const c=this.current;if(!c)return;const part=c.iterator.next();c.done=part.done;const data=part.value||Buffer.alloc(0);c.bytes=data.length;c.sentAt=performance.now();this.sentBytes+=data.length;this.send({id:c.id,seq:c.seq,data,done:c.done});}
 ack({id,seq}={}){const c=this.current;if(!c||c.id!==id||c.seq!==seq)return;if(c.done){this.current=null;this.drain();}else{c.seq++;this.next();}}
 drain(){while(this.ready&&!this.closed&&!this.current&&this.pending.size){const id=this.pending.values().next().value;this.pending.delete(id);const snapshot=this.snapshot(id);if(snapshot)this.start(id,snapshot);}}
 reset(){if(this.closed)return;const c=this.current;if(c){this.pending.add(c.runId);c.iterator.return?.();this.current=null;}this.ready=true;this.drain();}
 close(){this.closed=true;this.current?.iterator.return?.();this.current=null;this.pending.clear();}
 stats(){return {inFlightBytes:this.current?.bytes||0,awaitingAckMs:this.current?Math.round(performance.now()-this.current.sentAt):0,pendingRuns:this.pending.size,sentBytes:this.sentBytes,coalesced:this.coalesced};}
}
module.exports={RunDelivery};
