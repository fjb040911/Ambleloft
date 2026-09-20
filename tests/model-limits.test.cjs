const {test}=require('node:test');
const assert=require('node:assert/strict');
const {resolveLimits}=require('../electron/model-limits.cjs');
const {configurationArgs}=require('../electron/codex-rpc.cjs');
const {createProviderStore}=require('../electron/provider.cjs');
test('limits inherit, default to 80%, validate and reach Codex config',()=>{
 assert.deepEqual(resolveLimits({contextWindow:1000000},{}),{contextWindow:1000000,autoCompactTokenLimit:800000});
 assert.equal(resolveLimits({contextWindow:1000000},{contextWindow:100000}).autoCompactTokenLimit,80000);
 assert.throws(()=>resolveLimits({contextWindow:100,autoCompactTokenLimit:100}),/小于/);
 assert.throws(()=>resolveLimits({maxOutputTokens:-1}),/正整数/);
 const args=configurationArgs({effectiveLimits:resolveLimits({contextWindow:1000000})});
 assert.ok(args.includes('model_context_window=1000000'));
 assert.ok(args.includes('model_auto_compact_token_limit=800000'));
});
test('provider persists defaults and resolves selected model overrides',async()=>{
 let stored=null;
 const database={call:async(method,args)=>method==='readSetting'?stored:(stored=structuredClone(args.value))};
 const provider=createProviderStore('',{},database);
 const saved=await provider.save({baseUrl:'https://example.com/v1',model:'a',models:['a','b'],limits:{contextWindow:1000000,maxOutputTokens:1000},modelLimits:{b:{contextWindow:100000,maxOutputTokens:500}}});
 const config=await provider.secret(saved.id,'b');
 assert.deepEqual(config.effectiveLimits,{contextWindow:100000,maxOutputTokens:500,autoCompactTokenLimit:80000});
 assert.equal((await provider.public(saved.id)).limits.contextWindow,1000000);
});
