const {Worker}=require('node:worker_threads');
const path=require('node:path');
class Database {
 constructor(directory){
  this.worker=new Worker(path.join(__dirname,'database-worker.cjs'),{workerData:{file:path.join(directory,'atelier.sqlite')}});
  this.pending=new Map();this.sequence=0;this.failed=null;this.closed=false;
  const fail=error=>{this.failed=error;for(const p of this.pending.values())p.reject(error);this.pending.clear();};
  this.worker.on('error',fail);this.worker.on('exit',code=>{if(!this.closed)fail(new Error(`数据库进程已退出（${code}）`));});
  this.worker.on('message',message=>{if(message.fatal){fail(new Error(message.fatal));return;}const p=this.pending.get(message.id);if(!p)return;this.pending.delete(message.id);if(message.error)p.reject(new Error(message.error));else p.resolve(message.value);});
 }
 call(method,args){if(this.failed)return Promise.reject(this.failed);if(this.closed)return Promise.reject(new Error('数据库已关闭'));return new Promise((resolve,reject)=>{const id=++this.sequence;this.pending.set(id,{resolve,reject});try{this.worker.postMessage({id,method,args});}catch(error){this.pending.delete(id);reject(error);}});}
 async close(){if(this.closed)return;try{await this.call('close');}finally{this.closed=true;await this.worker.terminate();}}
}
module.exports={Database};
