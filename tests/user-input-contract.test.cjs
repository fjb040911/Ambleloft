const {test}=require('node:test'),assert=require('node:assert/strict');
const Ajv=require('ajv/dist/2020').default;
const schema=require('../specs/extensions/contracts/user-input/tools.schema.json');
const valid=new Ajv({strict:false,allErrors:true}).compile(schema);
const args=()=>({requestKey:'travel-1',reason:'需要确定出行范围',source:{kind:'dynamic',definition:{title:'出行安排',fields:[{name:'destination',label:'目的地',type:'text',required:true},{name:'budget',label:'总预算',type:'money',currency:'CNY',scale:2}]}},prefill:{destination:'上海'}});
const call=(name,arguments_)=>({name,arguments:arguments_});
test('U0 dynamic input contract compiles and shares the supported form field subset',()=>{
 assert.ok(valid(call('input_request',args())),JSON.stringify(valid.errors));
 const base=require('../specs/extensions/contracts/form.schema.json').$defs.field;
 for(const [key,value]of Object.entries(schema.$defs.field.properties))if(!['type','options'].includes(key))assert.deepEqual(value,base.properties[key]);
 assert.deepEqual(schema.$defs.field.properties.type.enum,base.properties.type.enum.filter(t=>t!=='group-toggle'));
});
test('U0 rejects execution bindings, extra identities and unsupported controls',()=>{
 for(const extra of [{runId:'other'},{operation:'pay'},{url:'https://example.com'},{submit:{kind:'operation'}}])assert.equal(valid(call('input_request',{...args(),...extra})),false);
 for(const field of [{name:'a',label:'A',type:'password'},{name:'a',label:'A',type:'group-toggle'},{name:'a',label:'A',type:'text',visibleWhen:{field:'x',equals:true}}]){const a=args();a.source.definition.fields=[field];assert.equal(valid(call('input_request',a)),false);}
 const a=args();delete a.requestKey;assert.equal(valid(call('input_request',a)),false);
});
test('U0 enforces structure bounds and explicit text-answer provenance',()=>{
 const a=args();a.source.definition.fields=Array.from({length:13},(_,i)=>({name:'f'+i,label:'F',type:'text'}));assert.equal(valid(call('input_request',a)),false);
 const value={requestId:'r',expectedRevision:0,sourceMessageIds:['m'],values:{budget:'5000'}};
 assert.ok(valid(call('input_resolve_from_message',value)));
 for(const patch of [{sourceMessageIds:[]},{sourceMessageIds:['m','m']},{expectedRevision:-1},{values:{budget:{value:1}}}])assert.equal(valid(call('input_resolve_from_message',{...value,...patch})),false);
 assert.equal(valid(call('input_capabilities',{extra:true})),false);
});
test('all published input tool names match the frozen contract',()=>{
 const {toolSchemas}=require('../core/inputs/definition.cjs');const {tools}=require('../core/inputs/model.cjs');
 assert.deepEqual(tools.map(t=>t.name).sort(),toolSchemas.map(t=>t.name).sort());
});
test('published schemas have explicit object roots and preserve contract validation',()=>{
 const {toolSchemas}=require('../core/inputs/definition.cjs');
 for(const tool of toolSchemas){
  assert.equal(tool.inputSchema.type,'object',tool.name);
  assert.equal(tool.inputSchema.$ref,undefined,tool.name);
  const check=new Ajv({strict:false,allErrors:true}).compile(tool.inputSchema);
  assert.equal(check(null),false,tool.name);
  assert.equal(check({unexpected:'value'}),false,tool.name);
  if(tool.name==='input_request'){
   assert.equal(check(args()),true,JSON.stringify(check.errors));
   const missing=args();delete missing.requestKey;assert.equal(check(missing),false);
   const nested=args();nested.source.definition.fields[0].type='password';assert.equal(check(nested),false);
  }
 }
});
