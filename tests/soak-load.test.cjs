const {test}=require('node:test'),assert=require('node:assert/strict');
const {chunk,checkLoad}=require('../scripts/probes/soak-load.cjs');
test('soak preflight rejects the observed oversize load without changing product limits',()=>{
 assert.throws(()=>checkLoad({minutes:120,intervalMs:50,chunkRepeat:8}),/32 MiB request budget/);
 assert.ok(checkLoad({minutes:120,intervalMs:50,chunkRepeat:8},{allowRequestLimit:true})>32*1024*1024);
});
test('bounded 20 Hz and standard 4 Hz schedules retain transport headroom',()=>{
 assert.ok(checkLoad({minutes:120,intervalMs:50,chunkRepeat:2})<28*1024*1024);
 assert.ok(checkLoad({minutes:120,intervalMs:250,chunkRepeat:8})<28*1024*1024);
 assert.ok(checkLoad({minutes:2,intervalMs:10,chunkRepeat:8})<28*1024*1024);
});
test('fixture retains deterministic Unicode and validates sizing inputs',()=>{
 assert.equal(chunk(1,2,2),'1/2 中文 English 😀 "quote" \\ newline\n1/2 中文 English 😀 "quote" \\ newline\n');
 for(const invalid of [0,-1,Infinity,NaN])assert.throws(()=>checkLoad({minutes:invalid,intervalMs:50,chunkRepeat:2}));
 assert.throws(()=>checkLoad({minutes:120,intervalMs:0,chunkRepeat:2}));
 assert.throws(()=>checkLoad({minutes:120,intervalMs:50,chunkRepeat:1.5}));
});
