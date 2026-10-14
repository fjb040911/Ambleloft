const {test}=require('node:test'),assert=require('node:assert/strict');
const {normalizeDynamic}=require('../core/inputs/definition.cjs');
const sample=require('../specs/extensions/examples/user-input/travel.json');
const fresh=()=>structuredClone(sample);
test('dynamic definition maps all eight field types to one deterministic chat page',()=>{
 const normalized=normalizeDynamic(fresh());assert.equal(normalized.template.steps.length,1);assert.equal(normalized.template.steps[0].id,'details');assert.equal(normalized.template.submit.kind,'chat');assert.deepEqual(normalized.prefill,{days:3,flexible:false,walking:false});
 assert.deepEqual(normalizeDynamic(fresh()),normalized);assert.equal(normalized.template.steps[0].fields.length,8);
});
test('rejects caller identities, operations, remote URLs, scripts and unsupported controls',()=>{
 for(const extra of [{runId:'other'},{originKey:'extension:payment'},{submit:{kind:'operation'}},{url:'https://example.com'}])assert.throws(()=>normalizeDynamic({...fresh(),...extra}),{code:'INVALID_ARGUMENT'});
 for(const patch of [{type:'password'},{type:'group-toggle'},{visibleWhen:{field:'other',equals:true}},{script:'alert(1)'},{operation:'pay'}]){const input=fresh();Object.assign(input.source.definition.fields[4],patch);assert.throws(()=>normalizeDynamic(input),{code:'INVALID_ARGUMENT'});}
});
test('semantic validation rejects duplicate names, options, wrong properties and invalid ranges',()=>{
 const badFields=[
 [{name:'a',type:'text',label:'A'},{name:'a',type:'text',label:'B'}],
 [{name:'s',type:'select',label:'S',options:[{label:'A',value:'a'},{label:'B',value:'a'}]}],
 [{name:'n',type:'number',label:'N',minimum:5,maximum:2}],
 [{name:'n',type:'number',label:'N',minimum:'1'}],
 [{name:'m',type:'money',label:'M',currency:'CNY',minimum:'10',maximum:'1'}],
 [{name:'d',type:'date',label:'D',minimum:'2026-02-30'}],
 [{name:'t',type:'text',label:'T',minLength:5,maxLength:2}],
 [{name:'t',type:'text',label:'T',options:[{label:'A',value:'a'}]}],
 [{name:'constructor',type:'text',label:'C'}]
 ];for(const fields of badFields){const input=fresh();input.source.definition.fields=fields;assert.throws(()=>normalizeDynamic(input),{code:'INVALID_ARGUMENT'});}
});
test('prefill rejects unknown, invalid, non-finite and non-scalar values without silent coercion',()=>{
 for(const prefill of [{unknown:'value'},{days:'3'},{days:1.5},{days:Infinity},{budget:'1.234'},{date:'2026-02-30'},{destination:'Shanghai'},{notes:{}},{name:'x'.repeat(41)}])assert.throws(()=>normalizeDynamic({...fresh(),prefill}),{code:'INVALID_ARGUMENT'});
 const p=JSON.parse('{"__proto__":"bad"}');assert.throws(()=>normalizeDynamic({...fresh(),prefill:p}),{code:'INVALID_ARGUMENT'});
});
test('limits apply to UTF-8 bytes as well as field and option counts',()=>{
 let input=fresh();input.source.definition.fields=Array.from({length:13},(_,i)=>({name:'f'+i,type:'text',label:'Field'}));assert.throws(()=>normalizeDynamic(input));
 input=fresh();input.source.definition.fields[0].options=Array.from({length:51},(_,i)=>({label:'Option',value:String(i)}));assert.throws(()=>normalizeDynamic(input));
 input=fresh();input.source.definition.fields=Array.from({length:12},(_,i)=>({name:'f'+i,type:'textarea',label:'Field',help:'中'.repeat(2000)}));assert.throws(()=>normalizeDynamic(input),/32 KiB/);
 input=fresh();input.source.definition.fields=[{name:'a',type:'textarea',label:'A'},{name:'b',type:'textarea',label:'B'}];input.prefill={a:'中'.repeat(11000),b:'中'.repeat(11000)};assert.throws(()=>normalizeDynamic(input),/64 KiB/);
});
test('dynamic strings are literal and option business values are preserved',()=>{
 const input=fresh();input.source.definition.title='%title%';input.source.definition.fields[0].label='%destination%';const result=normalizeDynamic(input);
 assert.equal(result.template.title,'%title%');assert.equal(result.template.steps[0].fields[0].label,'%destination%');assert.equal(result.template.steps[0].fields[0].options[0].value,'shanghai');
});
test('non-JSON values, cycles and blank labels cannot become hidden data',()=>{
 const input=fresh();input.prefill={days:undefined};assert.throws(()=>normalizeDynamic(input));
 input.prefill={notes:new Date()};assert.throws(()=>normalizeDynamic(input));input.prefill={};input.prefill.notes=input;assert.throws(()=>normalizeDynamic(input));
 const blank=fresh();blank.source.definition.title='  ';assert.throws(()=>normalizeDynamic(blank));
});
