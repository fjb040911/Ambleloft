const spool=require('./text-spool.cjs');
function* quoted(parts){yield '"';for(const text of parts)for(let at=0;at<text.length;at+=16384)yield JSON.stringify(text.slice(at,at+16384)).slice(1,-1);yield '"';}
// Emits complete JSON without ever allocating the serialized document/string.
function* jsonChunks(value,ancestors=new Set()){
 if(typeof value==='string'){yield* quoted([value]);return;}
 if(value===null||typeof value!=='object'){yield JSON.stringify(value)??'null';return;}
 if(ancestors.has(value))throw Error('CIRCULAR_JSON');ancestors.add(value);
 try{
  const array=Array.isArray(value);yield array?'[':'{';let first=true;
  for(const key of array?Array.from({length:value.length},(_,i)=>String(i)):Object.keys(value)){
   const ref=spool.reference(value,key);const child=ref?undefined:value[key];if(!array&&!ref&&(child===undefined||typeof child==='function'||typeof child==='symbol'))continue;
   if(!first)yield ',';first=false;if(!array){yield* quoted([key]);yield ':';}
   if(ref)yield* quoted(spool.chunks(ref));else yield* jsonChunks(child,ancestors);
  }
  yield array?']':'}';
 }finally{ancestors.delete(value);}
}
function* packets(value,limit=65536){let parts=[],length=0;for(const chunk of jsonChunks(value)){const bytes=Buffer.from(chunk);for(let at=0;at<bytes.length;){const count=Math.min(limit-length,bytes.length-at);parts.push(bytes.subarray(at,at+count));length+=count;at+=count;if(length===limit){yield Buffer.concat(parts,length);parts=[];length=0;}}}if(length)yield Buffer.concat(parts,length);}
module.exports={jsonChunks,packets};
