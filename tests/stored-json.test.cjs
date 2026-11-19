const test=require('node:test'),assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {storedText,hash,jsonChunks,boundedJSON}=require('../electron/stored-json.cjs');
const {canonical,runSources}=require('../core/continuity/sources.cjs');
function reference(text){const bytes=Buffer.from(text,'utf16le');return storedText({prepare(){return { *iterate(){for(let i=0;i<bytes.length;i+=18)yield {text:bytes.subarray(i,i+18)};} };}},[]);}
test('chunked text preserves canonical hashes and JSON across surrogate and escape boundaries',()=>{
 const text=('中文 English 😀\n"\\\t\ud800!\udc00').repeat(20000),ref=reference(text);
 assert.equal([...ref.chunks()].join(''),text);
 assert.equal(hash(ref),createHash('sha256').update(text).digest('hex'));
 const object={z:[ref,null,17],a:{text:ref,omitted:undefined}},plain={z:[text,null,17],a:{text,omitted:undefined}};
 assert.equal([...jsonChunks(object)].join(''),JSON.stringify(plain));
 assert.equal(hash(object),createHash('sha256').update(JSON.stringify(canonical(plain))).digest('hex'));
 assert.equal(boundedJSON(object,100),null);
 assert.equal(boundedJSON({text:reference('😀')},100),JSON.stringify({text:'😀'}));
});
test('completed source metadata stays identical without hydrating unrelated bodies',()=>{
 const text='answer 中文😀'.repeat(2000),run={id:'r',status:'completed',terminalTurnId:'u',messages:[{id:'u',role:'user',text:'question'},{id:'a',role:'assistant',text},{id:'reason',role:'assistant',kind:'reasoning',get text(){throw Error('reasoning hydrated');}}]};
 const plain=runSources(run,{}),chunked=runSources({...run,messages:[run.messages[0],{...run.messages[1],text:reference(text)},run.messages[2]]},{});
 const metadata=values=>values.map(({body,...value})=>value);
 assert.deepEqual(metadata(chunked),metadata(plain));
});

test('batched fingerprints match legacy canonical digests and scan stored text once',()=>{
 const text=('a中文😀\n"\\\ud800z\udc00').repeat(10000),base=reference(text);let reads=0;const original=base.chunks;base.chunks=function*(){reads++;yield* original.call(base);};const forms=[{key:'text',value:{role:'assistant'}},{key:'body',value:{accepted:true,z:[2,1],title:'x'}}];const actual=require('../electron/stored-json.cjs').textFingerprints(base,forms);
 assert.equal(reads,1);assert.equal(actual.contentHash,createHash('sha256').update(text).digest('hex'));assert.deepEqual(actual.forms,forms.map(({key,value})=>createHash('sha256').update(JSON.stringify(canonical({...value,[key]:text}))).digest('hex')));
});
