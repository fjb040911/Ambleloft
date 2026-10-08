const {randomUUID}=require('node:crypto');
class Interactions{
 constructor(registry,suspend){this.registry=registry;this.suspend=suspend;this.pending=new Map();}
 request(owner,payload,signal){
  if(signal?.aborted||owner.window.isDestroyed())return Promise.reject(Error('CANCELLED'));
  if(this.pending.has(owner.id))return Promise.reject(Error('BUSY'));
  return new Promise((resolve,reject)=>{
   const id=randomUUID(),resume=this.suspend(owner.window),finish=(error,value)=>{const p=this.pending.get(owner.id);if(p?.id!==id)return;this.pending.delete(owner.id);clearTimeout(timer);signal?.removeEventListener('abort',abort);owner.window.removeListener('closed',abort);if(!owner.window.isDestroyed())owner.window.webContents.send('extension:interaction-close',id);resume();error?reject(error):resolve(value);};
   const abort=()=>finish(Error('CANCELLED')),timer=setTimeout(()=>finish(Error('TIMEOUT')),120000);
   this.pending.set(owner.id,{id,finish});signal?.addEventListener('abort',abort,{once:true});owner.window.once('closed',abort);owner.window.webContents.send('extension:interaction',{...payload,id});
  });
 }
 respond(event,input){const owner=this.registry.authorize(event),p=this.pending.get(owner.id);if(!p||p.id!==input?.id)throw Error('FORBIDDEN');p.finish(input.cancel?Error('CANCELLED'):null,input);}
}
module.exports={Interactions};
