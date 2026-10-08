const {test}=require('node:test');const assert=require('node:assert/strict');const {LoginService}=require('../core/auth/login-service.cjs');
test('changed config and cancellation cannot commit in-flight authentication',async()=>{
 let release,commits=0;let connection={id:'one',issuer:'https://example.test',clientId:'desktop'};
 const service=new LoginService({readConnection:async()=>connection,openBrowser:async()=>{},commit:async()=>{commits++;},attempt:async()=>({result:Promise.resolve({status:'callback'}),cancel(){}}),protocol:{discover:async()=>({}),authorizationURL:()=>new URL('https://example.test'),exchange:()=>new Promise(resolve=>{release=()=>resolve({identity:{subject:'one'}});})}});
 const run=service.login('one');while(!release)await new Promise(resolve=>setImmediate(resolve));
 await assert.rejects(service.login('one'),/BUSY/);
 connection={...connection,clientId:'changed'};release();await assert.rejects(run,/CHANGED/);assert.equal(commits,0);
 release=null;const next=service.login('one');while(!release)await new Promise(resolve=>setImmediate(resolve));
 service.cancel('one');release();await assert.rejects(next,/CANCELLED/);assert.equal(commits,0);
});
