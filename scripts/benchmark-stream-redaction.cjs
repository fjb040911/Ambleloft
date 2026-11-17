// Uses synthetic credentials only; no provider access or user data.
const {StreamRedactor}=require('../electron/stream-redactor.cjs');
const key='synthetic-secret',chunks=Array.from({length:1200},(_,i)=>i%2?'secret '+'ordinary '.repeat(200):'ordinary '.repeat(200)+'synthetic-');
let before='',scanned=0;const start=performance.now();
for(const chunk of chunks){scanned+=before.length+chunk.length;before=(before+chunk).split(key).join('[REDACTED]');}
const legacyMs=performance.now()-start,redactor=new StreamRedactor(key);let after='';const next=performance.now();
for(const chunk of chunks)after+=redactor.write(chunk);after+=redactor.end();
console.log(JSON.stringify({characters:chunks.reduce((n,s)=>n+s.length,0),legacyScanned:scanned,incrementalScanned:redactor.scanned,legacyMs,incrementalMs:performance.now()-next,equal:before===after,matches:(after.match(/\[REDACTED\]/g)||[]).length},null,2));
if(before!==after)process.exitCode=1;
