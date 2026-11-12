const {test}=require('node:test'),assert=require('node:assert/strict');
const {resolveBudget,recoverBudget,estimateInput,thinking,limitErrorKind}=require('../core/models/budget.cjs');
const {parseCapacity,discoverCapacity}=require('../core/models/capacity.cjs');
test('scenarios reserve reasoning headroom and chat/expert share the same policy',()=>{
 for(const reasoning of [false,true]){
  const chat=resolveBudget({},{profile:'chat',reasoning}),expert=resolveBudget({},{profile:'expert',reasoning});
  assert.equal(chat.maxOutputTokens,expert.maxOutputTokens);assert.equal(chat.source,'fallback');
 }
 assert.equal(resolveBudget({},{profile:'discussion-host',reasoning:true}).maxOutputTokens,32768);
 assert.equal(resolveBudget({},{profile:'discussion-host',reasoning:false}).maxOutputTokens,8192);
 assert.equal(resolveBudget({},{profile:'conversation',reasoning:true}).maxOutputTokens,16384);
 assert.equal(thinking({model:'deepseek-flash'}),true);assert.equal(thinking({model:'deepseek-flash',reasoningSummary:false}),false);
});
test('explicit request, user ceilings, discovered ceilings and context headroom are independent',()=>{
 const config={effectiveLimits:{maxOutputTokens:40000,contextWindow:100000},detectedModelLimits:{maxOutputTokens:20000,contextWindow:80000}};
 const budget=resolveBudget(config,{profile:'expert',requested:30000,inputTokens:70000});
 assert.equal(budget.maxOutputTokens,8976);assert.equal(budget.source,'discovered');assert.equal(budget.outputCeiling,20000);
 assert.equal(recoverBudget(budget),null);
 const explicit=resolveBudget(config,{requested:4096});assert.equal(explicit.maxOutputTokens,4096);assert.equal(recoverBudget(explicit).maxOutputTokens,8192);
 assert.throws(()=>resolveBudget(config,{inputTokens:80000}),/CONTEXT_LIMIT/);
 assert.equal(resolveBudget({effectiveLimits:{maxOutputTokens:1000},detectedModelLimits:{maxOutputTokens:20000}},{requested:4000}).source,'configured');
});
test('recovery cannot replay committed output or retry context failures; caps never expand',()=>{
 const budget=resolveBudget({},{profile:'chat',reasoning:true});
 assert.equal(recoverBudget(budget).maxOutputTokens,65536);
 for(const options of [{attempts:1},{committed:true},{reason:'context'},{reason:'format'}])assert.equal(recoverBudget(budget,options),null);
 const capped=resolveBudget({effectiveLimits:{maxOutputTokens:6000}},{requested:8192});assert.equal(recoverBudget(capped),null);
 assert.equal(recoverBudget(resolveBudget({},{requested:100000})),null);
 assert.equal(limitErrorKind('maximum context length exceeded'),'context');assert.equal(limitErrorKind('max_tokens must be at most 8192'),'output');
 assert.equal(limitErrorKind('invalid schema'),null);
});
test('capacity metadata is exact-model scoped and does not confuse context with output',()=>{
 assert.deepEqual(parseCapacity({data:[{id:'a',context_window:1000000,max_output_tokens:64000},{id:'b',context_window:32000}]},'b'),{contextWindow:32000});
 assert.deepEqual(parseCapacity({data:[{id:'a',max_output_tokens:'64000'}]},'a'),{});
 assert.deepEqual(parseCapacity({data:[{id:'a',max_output_tokens:64000}]},'unknown'),{});
 assert.ok(estimateInput({input:'data:image/png;base64,'+'x'.repeat(1000000)})<10000);
});
test('optional discovery caches by endpoint, model and credential revision; manual limits survive',async t=>{
 let calls=0;const original=global.fetch;t.after(()=>{global.fetch=original;});
 global.fetch=async(url,options)=>{calls++;assert.equal(options.redirect,'error');return new Response(JSON.stringify({data:[{id:'test',max_output_tokens:50000,context_window:100000}]}));};
 const config={baseUrl:'https://capacity.fixture/v1',model:'test',apiKey:'private',discoverModelLimits:true,effectiveLimits:{maxOutputTokens:12000}};
 await discoverCapacity(config);await discoverCapacity({...config});assert.equal(calls,1);assert.equal(resolveBudget(config,{profile:'chat'}).maxOutputTokens,12000);
 await discoverCapacity({...config,revision:2});assert.equal(calls,2);
 const controller=new AbortController();controller.abort();await assert.rejects(discoverCapacity(config,controller.signal),/abort/i);
 global.fetch=async()=>{calls++;return new Response('unavailable',{status:404});};
 const absent={...config,baseUrl:'https://absent.fixture/v1'};await discoverCapacity(absent);await discoverCapacity(absent);assert.equal(calls,3);assert.deepEqual(absent.detectedModelLimits,{});
});
test('HTTP context and output-budget rejections are classified separately, never format-retried',async t=>{
 const {generate}=require('../core/automation/provider.cjs');
 const original=global.fetch;t.after(()=>{global.fetch=original;});
 for(const [message,expected] of [['maximum context length exceeded','CONTEXT_LIMIT'],['max_tokens must be at most 4096','OUTPUT_BUDGET_REJECTED']]){
  let calls=0;global.fetch=async()=>{calls++;return new Response(JSON.stringify({error:{message}}),{status:400});};
  await assert.rejects(generate({baseUrl:'https://budget.fixture',model:'test',protocol:'chat'},{budgetProfile:'discussion-host',retryOutputLimit:true,repairInvalidOutput:true,prompt:'Return JSON',input:{},outputSchema:{type:'object'}}),e=>e.message===expected);
  assert.equal(calls,1);
 }
});
test('engine compaction reserves generation headroom and respects discovered context capacity',()=>{
 const {configurationArgs}=require('../electron/codex-rpc.cjs');
 const args=configurationArgs({model:'deepseek-test',effectiveLimits:{contextWindow:100000,autoCompactTokenLimit:80000},detectedModelLimits:{contextWindow:50000,maxOutputTokens:16000}});
 assert.ok(args.includes('model_context_window=50000'));assert.ok(args.includes('model_auto_compact_token_limit=32976'));
});
