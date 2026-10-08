const {test}=require('node:test');const assert=require('node:assert/strict');const {createHash}=require('node:crypto');const {createLoginAttempt}=require('../core/auth/login-attempt.cjs');
test('loopback validates state without consuming login and returns code only to host',async()=>{
 const a=await createLoginAttempt();try{
 assert.equal(a.challenge,createHash('sha256').update(a.verifier).digest('base64url'));
 assert.equal((await fetch(a.redirectUri+'?state=wrong&code=secret')).status,400);
 const response=await fetch(a.redirectUri+'?state='+a.state+'&code=secret');
 assert.equal((await response.text()).includes('secret'),false);assert.equal(response.headers.get('cache-control'),'no-store');
 const result=await a.result;assert.equal(result.status,'callback');assert.equal(result.code,'secret');assert.equal(new URLSearchParams(result.parameters).get('state'),a.state);
 }finally{a.cancel();}
});
test('cancel and timeout finish without a callback or credentials',async()=>{
 const a=await createLoginAttempt();a.cancel();assert.deepEqual(await a.result,{status:'cancelled'});
 const b=await createLoginAttempt({timeoutMs:10});assert.deepEqual(await b.result,{status:'timeout'});
});
