// Fixture sizing only. Never changes the product's 32 MiB request guard.
const assert=require('node:assert/strict');
function chunk(source,index,repeat){return `${source}/${index} 中文 English 😀 "quote" \\ newline\n`.repeat(repeat);}
function estimateRequestBytes({minutes,intervalMs,chunkRepeat}){
 assert.ok(Number.isFinite(minutes)&&minutes>0);assert.ok(Number.isFinite(intervalMs)&&intervalMs>=1);
 assert.ok(Number.isInteger(chunkRepeat)&&chunkRepeat>=1&&chunkRepeat<=8);
 // Conservative 105-minute active window at the 120-minute schedule scale,
 // plus reasoning and framing. Leave room for tools and engine context.
 const frames=Math.ceil(minutes*60000*105/120/intervalMs);
 return frames*(Buffer.byteLength(JSON.stringify(chunk(999,999999,chunkRepeat)))+16);
}
function checkLoad(input,{allowRequestLimit=false}={}){
 const estimated=estimateRequestBytes(input);
 if(estimated>28*1024*1024&&!allowRequestLimit)throw Error('Synthetic load may exceed the 32 MiB request budget on resume. Reduce SOAK_CHUNK_REPEAT or rate; use SOAK_ALLOW_REQUEST_LIMIT=1 only for an explicit rejection test.');
 return estimated;
}
module.exports={chunk,estimateRequestBytes,checkLoad};
