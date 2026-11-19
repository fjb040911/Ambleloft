const {StringDecoder}=require('node:string_decoder'),{createHash}=require('node:crypto');
const textReference=Symbol('stored text');
const isText=value=>!!value?.[textReference];
function storedText(db,args){
 return {[textReference]:true,*chunks(){
  const decoder=new StringDecoder('utf16le');
  for(const row of db.prepare('SELECT text FROM run_text_chunks WHERE run_id=? AND collection=? AND item_key=? AND field=? ORDER BY seq').iterate(...args)){
   const text=decoder.write(Buffer.from(row.text));if(text)yield text;
  }
  const end=decoder.end();if(end)yield end;
 }};
}
function* quoted(parts){
 yield '"';let carry='';
 for(const part of parts)for(let at=0;at<part.length;at+=16384){let text=carry+part.slice(at,at+16384);carry='';const last=text.charCodeAt(text.length-1);if(last>=0xd800&&last<=0xdbff){carry=text.slice(-1);text=text.slice(0,-1);}if(text)yield JSON.stringify(text).slice(1,-1);}
 if(carry)yield JSON.stringify(carry).slice(1,-1);yield '"';
}
function* jsonChunks(value,sorted=false){
 if(isText(value)){yield* quoted(value.chunks());return;}
 if(typeof value==='string'){yield* quoted([value]);return;}
 if(value===null||typeof value!=='object'){yield JSON.stringify(value)??'null';return;}
 const array=Array.isArray(value);yield array?'[':'{';let first=true;
 const keys=array?Array.from({length:value.length},(_,i)=>String(i)):Object.keys(value).filter(k=>value[k]!==undefined);
 if(sorted&&!array)keys.sort();
 for(const key of keys){if(!first)yield ',';first=false;if(!array){yield JSON.stringify(key);yield ':';}yield* jsonChunks(value[key],sorted);}
 yield array?']':'}';
}
function hash(value){return require('./storage-timing.cjs').measure('databaseFingerprintMs',()=>hashValue(value));}
function hashValue(value){const h=createHash('sha256');if(isText(value)){for(const part of value.chunks())h.update(part);}else if(typeof value==='string')h.update(value);else for(const part of jsonChunks(value,true))h.update(part);return h.digest('hex');}
function boundedJSON(value,limit){let bytes=0;const parts=[];for(const part of jsonChunks(value)){bytes+=Buffer.byteLength(part);if(bytes>limit)return null;parts.push(part);}return parts.join('');}
// Compute the raw body and several canonical JSON fingerprints with one disk
// scan and one escaping pass. Only hash contexts are retained, never body copies.
function textFingerprints(text,forms){return require('./storage-timing.cjs').measure('databaseFingerprintMs',()=>{
 const raw=createHash('sha256'),contexts=forms.map(({key,value})=>{
  const keys=[...Object.keys(value).filter(k=>value[k]!==undefined&&k!==key),key].sort(),at=keys.indexOf(key);
  const entry=k=>JSON.stringify(k)+':'+[...jsonChunks(value[k],true)].join('');
  const prefix='{'+keys.slice(0,at).map(entry).join(',')+(at?',':'')+JSON.stringify(key)+':';
  const suffix=(at<keys.length-1?',':'')+keys.slice(at+1).map(entry).join(',')+'}';
  return {hash:createHash('sha256').update(prefix),suffix};
 });
 function* parts(){for(const part of isText(text)?text.chunks():[text]){raw.update(part);yield part;}}
 for(const part of quoted(parts()))for(const context of contexts)context.hash.update(part);
 return {contentHash:raw.digest('hex'),forms:contexts.map(c=>c.hash.update(c.suffix).digest('hex'))};
});}
module.exports={storedText,isText,hash,jsonChunks,boundedJSON,textFingerprints};
