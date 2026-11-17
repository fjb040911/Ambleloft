const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {randomUUID,createHash}=require('node:crypto');
const fields=new WeakMap(),digestStates=new WeakMap(),cleanedRoots=new Set();
function cleanOrphans(root){if(cleanedRoots.has(root))return;cleanedRoots.add(root);for(const name of fs.readdirSync(root)){const match=/^amble-text-(\d+)-/.exec(name);if(!match)continue;try{process.kill(Number(match[1]),0);}catch(error){if(error.code==='ESRCH')try{fs.rmSync(path.join(root,name),{recursive:true,force:true});}catch{}}}}

const threshold=8192,block=32768;
const copy=text=>Buffer.from(text,'utf16le').toString('utf16le');
class TextSpool {
 constructor(root=os.tmpdir()){fs.mkdirSync(root,{recursive:true});cleanOrphans(root);this.directory=fs.mkdtempSync(path.join(root,'amble-text-'+process.pid+'-'));fs.chmodSync(this.directory,0o700);this.pending=new Map();this.bytes=0;this.writtenBytes=0;this.files=0;this.closed=false;}
 create(text=''){const value={kind:'spool',file:path.join(this.directory,randomUUID()),generation:randomUUID(),length:0,preview:'',hashState:createHash('sha256'),store:this};fs.writeFileSync(value.file,'',{mode:0o600});this.files++;this.append(value,text);return value;}
 append(value,text){
  if(this.closed)throw Error('TEXT_SPOOL_CLOSED');if(!text)return;
  value.hashState.update(text,'utf16le');value.length+=text.length;value.preview=copy((value.preview+text.slice(-2048)).slice(-2048));
  // Enqueue the accepted delta before attempting I/O: on a short write/error the
  // unwritten suffix remains retryable, including blocks later in this delta.
  const parts=this.pending.get(value)||[];
  for(let i=0;i<text.length;i+=block){const part=Buffer.from(text.slice(i,i+block),'utf16le');parts.push(part);this.bytes+=part.length;}
  this.pending.set(value,parts);if(parts.reduce((n,p)=>n+p.length,0)>=65536)this.flush(value);
  while(this.bytes>1024*1024)this.flush(this.pending.keys().next().value);
 }
 flush(value){
  const parts=this.pending.get(value);if(!parts)return;const fd=fs.openSync(value.file,'a');let writtenBytes=0;
  try{for(const part of parts){let at=0;while(at<part.length){const written=fs.writeSync(fd,part,at,part.length-at);if(!written)throw Error('TEXT_SPOOL_WRITE_FAILED');at+=written;writtenBytes+=written;this.writtenBytes+=written;}}}
  finally{fs.closeSync(fd);this.bytes-=writtenBytes;const remaining=[];for(const part of parts){if(writtenBytes>=part.length){writtenBytes-=part.length;continue;}remaining.push(writtenBytes?part.subarray(writtenBytes):part);writtenBytes=0;}if(remaining.length)this.pending.set(value,remaining);else this.pending.delete(value);}
 }
 snapshot(value){this.flush(value);const ref={kind:'spool',file:value.file,generation:value.generation,length:value.length,revision:value.generation+':'+value.length,preview:value.preview,hash:value.hashState.copy().digest('hex')};digestStates.set(ref,value.hashState.copy());return ref;}
 stats(){return {bufferedBytes:this.bytes,writtenBytes:this.writtenBytes,files:this.files};}
 close(){if(this.closed)return;this.closed=true;this.pending.clear();this.bytes=0;try{fs.rmSync(this.directory,{recursive:true,force:true,maxRetries:2,retryDelay:10});}catch(error){this.cleanupError=error.code;}}
}
function* chunks(ref,start=0,end=ref.length){
 if(ref.kind==='joined'){let at=0;for(const part of ref.parts){const length=typeof part==='string'?part.length:part.length;if(at+length>start&&at<end){if(typeof part==='string')yield part.slice(Math.max(0,start-at),end-at);else yield* chunks(part,Math.max(0,start-at),Math.min(length,end-at));}at+=length;}return;}
 const fd=fs.openSync(ref.file,'r');try{const bytes=Buffer.allocUnsafe(block*2);for(let at=start;at<end;){const length=Math.min(block,end-at)*2;let read=0;while(read<length){const n=fs.readSync(fd,bytes,read,length-read,at*2+read);if(!n)throw Error('TEXT_SPOOL_INCOMPLETE');read+=n;}yield bytes.subarray(0,length).toString('utf16le');at+=length/2;}}finally{fs.closeSync(fd);}
}
function read(ref,start=0,end=ref.length){return [...chunks(ref,start,end)].join('');}
function raw(owner,key){return fields.get(Object.getOwnPropertyDescriptor(owner,key)?.get);}
function reference(owner,key){const value=raw(owner,key);return value?.snapshot?value.snapshot():value?.store.snapshot(value);}
function install(owner,key,value){const get=()=>read(value.store.snapshot(value));fields.set(get,value);Object.defineProperty(owner,key,{enumerable:true,configurable:true,get,set(text){Object.defineProperty(this,key,{value:text,writable:true,enumerable:true,configurable:true});}});}
function append(owner,key,text,store){let value=raw(owner,key);if(value?.store){store.append(value,text);return;}const previous=owner[key]||'';if(store&&previous.length+text.length>threshold){value=store.create(previous);store.append(value,text);install(owner,key,value);}else owner[key]=previous+text;}
function spoolObject(item,store){if(!item||typeof item!=='object'||!store)return;for(const key of Object.keys(item)){const property=Object.getOwnPropertyDescriptor(item,key);if(!('value'in property))continue;const value=property.value;if(typeof value==='string'&&value.length>threshold)install(item,key,store.create(value));else if(value&&typeof value==='object')spoolObject(value,store);}}
// Compare immutable prefixes by generation/length, without reading old bodies.
function prefix(before,after){
 if(after?.kind==='joined'&&before?.kind!=='joined')return after.parts.length>0&&prefix(before,after.parts[0]);
 if(typeof before==='string')return typeof after==='string'?after.startsWith(before):!!after&&after.length>=before.length&&read(after,0,before.length)===before;
 if(typeof after==='string'||!before||!after)return false;
 if(before.kind==='spool')return after.kind==='spool'&&before.generation===after.generation&&before.length<=after.length;
 if(before.kind!=='joined'||after.kind!=='joined'||before.parts.length>after.parts.length)return false;
 return before.parts.every((part,index)=>index===before.parts.length-1?prefix(part,after.parts[index]):typeof part==='string'?part===after.parts[index]:part.revision===after.parts[index]?.revision);
}
function joined(owner,key,parts){
 const previous=raw(owner,key);if(previous?.update){previous.update(parts);return;}
 let last,hash;const value={update(next){parts=next;},snapshot(){
  const values=parts();if(values.length===1&&typeof values[0]!=='string'){last=values[0];hash=digestStates.get(last)?.copy();return last;}
  const list=[];values.forEach((part,index)=>{if(index)list.push('\n\n');list.push(part);});
  const length=list.reduce((n,p)=>n+p.length,0),ref={kind:'joined',parts:list,length};
  ref.revision=createHash('sha256').update(JSON.stringify(list.map(p=>typeof p==='string'?p:[p.generation,p.revision,p.length]))).digest('hex');
  if(last?.revision===ref.revision)return last;
  const start=hash&&prefix(last,ref)?last.length:0;if(!start)hash=createHash('sha256');
  for(const text of chunks(ref,start))hash.update(text,'utf16le');ref.hash=hash.copy().digest('hex');
  ref.preview=read(ref,Math.max(0,length-2048));last=ref;return ref;
 }};
 const get=()=>read(value.snapshot());fields.set(get,value);Object.defineProperty(owner,key,{enumerable:true,configurable:true,get,set(text){Object.defineProperty(this,key,{value:text,writable:true,enumerable:true,configurable:true});}});
}
function part(owner,key){return reference(owner,key)??String(owner[key]||'');}
function nonempty(parts){return parts&&Object.keys(parts).some(key=>(reference(parts,key)?.length??String(parts[key]||'').length)>0);}
module.exports={install,prefix,nonempty,TextSpool,reference,raw,read,chunks,append,spoolObject,joined,part};
