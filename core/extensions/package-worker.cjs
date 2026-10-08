// Untrusted package work stays off the main thread. No package code is imported.
const {parentPort,workerData}=require('node:worker_threads');
const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');const zlib=require('node:zlib');
const MAX=250*1024*1024;let total=0,count=0;const seen=new Map(),components=new Map();
function claim(name,directory=false){
 if(directory)name=name.replace(/\/$/,'');
 if(!name||name.includes('\\')||name.includes(':')||(/[<>|?*\x00-\x1f]/.test(name))||name.split('/').some(p=>!p||p==='.'||p==='..'||/[. ]$/.test(p)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p)))throw Error('Unsafe package path');
 for(let parts=name.split('/'),i=1;i<=parts.length;i++){const prefix=parts.slice(0,i).join('/'),key=prefix.normalize('NFC').toLowerCase();if(components.has(key)&&components.get(key)!==prefix)throw Error('Case-colliding package path');components.set(key,prefix);}
 const key=name.normalize('NFC').toLowerCase();if(seen.has(key))throw Error('Duplicate package path');
 for(const [other,isDirectory] of seen)if((key.startsWith(other+'/')&&!isDirectory)||(other.startsWith(key+'/')&&!directory))throw Error('Conflicting package path');
 seen.set(key,directory);if(++count>10000)throw Error('Package file count exceeded');return name;
}
function write(name,data){total+=data.length;if(total>MAX)throw Error('Package size exceeded');const target=path.join(workerData.stage,name);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,data,{flag:'wx'});}
function crc32(data){let c=0xffffffff;for(const b of data){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;}
function unzip(source){
 const stat=fs.lstatSync(source);if(!stat.isFile()||stat.size>100*1024*1024)throw Error('Invalid archive size');const zip=fs.readFileSync(source);let end=-1;
 for(let i=zip.length-22;i>=Math.max(0,zip.length-65557);i--)if(zip.readUInt32LE(i)===0x06054b50&&i+22+zip.readUInt16LE(i+20)===zip.length){end=i;break;}
 if(end<0||zip.readUInt16LE(end+4)||zip.readUInt16LE(end+6))throw Error('Invalid ZIP');
 const n=zip.readUInt16LE(end+10),offset=zip.readUInt32LE(end+16),size=zip.readUInt32LE(end+12);if(n!==zip.readUInt16LE(end+8)||n>10000||offset+size!==end)throw Error('Unsupported ZIP');let cursor=offset;
 for(let i=0;i<n;i++){
  if(cursor+46>end||zip.readUInt32LE(cursor)!==0x02014b50)throw Error('Invalid ZIP entry');
  const flags=zip.readUInt16LE(cursor+8),method=zip.readUInt16LE(cursor+10),crc=zip.readUInt32LE(cursor+16),packed=zip.readUInt32LE(cursor+20),length=zip.readUInt32LE(cursor+24),nl=zip.readUInt16LE(cursor+28),el=zip.readUInt16LE(cursor+30),cl=zip.readUInt16LE(cursor+32),attrs=zip.readUInt32LE(cursor+38),local=zip.readUInt32LE(cursor+42);
  if(flags&1||![0,8].includes(method)||length>MAX-total||cursor+46+nl+el+cl>end||zip.readUInt16LE(cursor+34))throw Error('Unsupported ZIP entry');
  const bytes=zip.subarray(cursor+46,cursor+46+nl),name=new TextDecoder('utf-8',{fatal:true}).decode(bytes),directory=name.endsWith('/'),mode=(attrs>>>16)&0xf000;
  if(mode&&mode!==(directory?0x4000:0x8000))throw Error('Package links and special files forbidden');claim(name,directory);
  if(local+30>offset||zip.readUInt32LE(local)!==0x04034b50||zip.readUInt16LE(local+6)!==flags||zip.readUInt16LE(local+8)!==method)throw Error('Invalid local entry');
  const ln=zip.readUInt16LE(local+26),le=zip.readUInt16LE(local+28),start=local+30+ln+le;
  if(!zip.subarray(local+30,local+30+ln).equals(bytes)||start+packed>offset)throw Error('Invalid ZIP data');
  const data=method===0?zip.subarray(start,start+packed):zlib.inflateRawSync(zip.subarray(start,start+packed),{maxOutputLength:Math.max(1,length)});
  if(data.length!==length||crc32(data)!==crc)throw Error('ZIP integrity check failed');
  if(directory){if(length)throw Error('Invalid directory');fs.mkdirSync(path.join(workerData.stage,name),{recursive:true});}else write(name,data);
  cursor+=46+nl+el+cl;
 }
 if(cursor!==end)throw Error('Invalid ZIP directory');
}
function copy(source,relative=''){
 const stat=fs.lstatSync(source);if(stat.isSymbolicLink()||(!stat.isDirectory()&&(!stat.isFile()||stat.nlink>1)))throw Error('Package links and special files forbidden');
 if(relative)claim(relative,stat.isDirectory());
 if(stat.isDirectory()){for(const name of fs.readdirSync(source).sort())copy(path.join(source,name),relative?relative+'/'+name:name);}
 else {if(stat.size>MAX-total)throw Error('Package size exceeded');write(relative,fs.readFileSync(source));}
}
if(workerData.valueSchema){try{parentPort.postMessage({valid:require(workerData.validator).compileValueValidator(workerData.valueSchema)(workerData.value)});}catch(error){parentPort.postMessage({error:error.message});}}else{
try{
 fs.mkdirSync(workerData.stage,{recursive:true});if(workerData.mode==='directory')copy(workerData.source);else unzip(workerData.source);
 const validator=require(workerData.validator);const result=validator.validatePackage(workerData.stage);if(!result.ok)throw Error(result.errors.map(e=>e.path+': '+e.message).join('\n'));
 const hash=crypto.createHash('sha256');
 function hashFiles(dir,base=''){for(const name of fs.readdirSync(dir).sort()){const file=path.join(dir,name),rel=base+name;const stat=fs.statSync(file);if(stat.isDirectory())hashFiles(file,rel+'/');else {hash.update(JSON.stringify([rel,stat.size]));hash.update(fs.readFileSync(file));}}}hashFiles(workerData.stage);
 parentPort.postMessage({icons:result.icons,manifest:result.manifest,dictionaries:result.dictionaries,id:result.extensionId,digest:hash.digest('hex')});
}catch(error){parentPort.postMessage({error:error.message});}
}
