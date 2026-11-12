// Shared by structured orchestration and the chat/expert protocol bridge.
// These are application budgets, never claims about a model's capacity.
const PROFILES=Object.freeze({
 structured:{output:2048,reasoning:2048},
 conversation:{output:4096,reasoning:16384},
 chat:{output:16384,reasoning:32768},
 expert:{output:16384,reasoning:32768},
 'discussion-host':{output:8192,reasoning:32768},
 'task-plan':{output:16384,reasoning:32768},
});
const FALLBACK_RECOVERY_CEILING=65536;
const positive=n=>Number.isSafeInteger(n)&&n>0;
function thinking(config,request={}){
 if(request.thinking?.type)return request.thinking.type==='enabled';
 if(config.reasoningSummary===false)return false;
 return !!request.reasoning||config.reasoningSummary===true||/^deepseek/i.test(config.model||'');
}
function resolveBudget(config,{profile='structured',requested,inputTokens=0,reasoning=false}={}){
 const policy=PROFILES[profile]||PROFILES.structured;
 const wanted=positive(requested)?requested:reasoning?policy.reasoning:policy.output;
 const configured=config.effectiveLimits||{},detected=config.detectedModelLimits||{};
 const caps=[configured.maxOutputTokens,detected.maxOutputTokens].filter(positive);
 const windows=[configured.contextWindow,detected.contextWindow].filter(positive);
 const contextWindow=windows.length?Math.min(...windows):null;
 // Estimates are deliberately identified as estimates in diagnostics. Leave
 // room for protocol/tokenizer overhead; server limits remain authoritative.
 const reserve=contextWindow?Math.min(1024,Math.ceil(contextWindow*.05)):0;
 const available=contextWindow?Math.max(0,contextWindow-Math.max(0,inputTokens)-reserve):null;
 if(available===0)throw Object.assign(Error('CONTEXT_LIMIT'),{definitive:true,diagnostics:{stage:'budget',contextWindow,inputTokens,estimated:true}});
 const outputCeiling=caps.length?Math.min(...caps):null;
 const maximum=Math.min(wanted,outputCeiling||Infinity,available??Infinity);
 return {profile:Object.hasOwn(PROFILES,profile)?profile:'structured',maxOutputTokens:maximum,requestedTokens:wanted,
  outputCeiling,contextWindow,inputTokens,contextReserve:reserve,availableOutputTokens:available,estimated:true,
  source:caps.length?(positive(configured.maxOutputTokens)&&configured.maxOutputTokens<=(detected.maxOutputTokens||Infinity)?'configured':'discovered'):'fallback',reasoning};
}
function recoverBudget(budget,{attempts=0,committed=false,reason='output'}={}){
 if(reason!=='output'||attempts>=1||committed)return null;
 const ceiling=budget.outputCeiling||Math.max(budget.maxOutputTokens,FALLBACK_RECOVERY_CEILING);
 const next=Math.min(budget.maxOutputTokens*2,ceiling,budget.availableOutputTokens??Infinity);
 // No same-budget retry: it cannot supply missing output capacity.
 return next>budget.maxOutputTokens?{...budget,maxOutputTokens:next,requestedTokens:next}:null;
}
function estimateInput(value){
 // Tokenizer-independent estimate, not exact billing or a capability probe.
 // Do not count base64 media bytes as text tokens.
 let bytes=0,media=0;
 const walk=v=>{
  if(typeof v==='string'){if(v.startsWith('data:image/')||v.startsWith('data:audio/'))media+=2048;else bytes+=Buffer.byteLength(v);}
  else if(Array.isArray(v))v.forEach(walk);
  else if(v&&typeof v==='object'){if(['input_image','image_url'].includes(v.type))media+=2048;for(const [k,x] of Object.entries(v)){bytes+=k.length+4;walk(x);}}
 };
 walk(value);return Math.ceil(bytes/3)+media;
}
function limitErrorKind(text){
 const value=String(text).toLowerCase();
 if(/context_length_exceeded|context.{0,40}(length|window|limit)|input.{0,30}(too long|too large|exceed)|prompt.{0,30}(too long|exceed)/.test(value))return 'context';
 if(/max[_ ]?(output[_ ]?|completion[_ ]?)?tokens|output.{0,30}(token|length|limit)/.test(value))return 'output';
 return null;
}
function runtimeContextLimits(config){
 const budget=resolveBudget(config,{profile:'chat',reasoning:thinking(config)});
 if(!budget.contextWindow)return config.effectiveLimits||{};
 // The engine owns compaction. Reserve output headroom before it reaches the
 // server's context boundary; do not trim or rewrite user history here.
 const ceiling=Math.max(1,budget.contextWindow-budget.maxOutputTokens-budget.contextReserve);
 return {contextWindow:budget.contextWindow,autoCompactTokenLimit:Math.min(config.effectiveLimits?.autoCompactTokenLimit||Math.floor(budget.contextWindow*.8),ceiling)};
}
module.exports={PROFILES,FALLBACK_RECOVERY_CEILING,resolveBudget,recoverBudget,estimateInput,thinking,limitErrorKind,runtimeContextLimits};
