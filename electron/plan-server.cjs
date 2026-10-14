// Local MCP tools for the user-visible task plan and explicit deliverable declarations.
const {createInterface}=require('node:readline');
const inputSchema={type:'object',properties:{explanation:{type:'string'},plan:{type:'array',minItems:1,maxItems:30,items:{type:'object',properties:{step:{type:'string',minLength:1,maxLength:500},status:{type:'string',enum:['pending','in_progress','completed']}},required:['step','status'],additionalProperties:false}}},required:['plan'],additionalProperties:false};
function validPlan(args){return args&&Array.isArray(args.plan)&&args.plan.length>0&&args.plan.length<=30&&args.plan.every(s=>s&&typeof s.step==='string'&&s.step.trim()&&s.step.length<=500&&['pending','in_progress','completed'].includes(s.status))&&(args.explanation===undefined||(typeof args.explanation==='string'&&args.explanation.length<=2000));}
const deliverySchema={type:'object',properties:{path:{type:'string',minLength:1,maxLength:4096},title:{type:'string',minLength:1,maxLength:160}},required:['path','title'],additionalProperties:false};
function validDelivery(args){return args&&typeof args.path==='string'&&!!args.path.trim()&&args.path.length<=4096&&typeof args.title==='string'&&!!args.title.trim()&&args.title.length<=160;}
function handle(message){
 if(message.id===undefined)return;
 let result;
 if(message.method==='initialize')result={protocolVersion:message.params?.protocolVersion||'2024-11-05',capabilities:{tools:{}},serverInfo:{name:'atelier-progress',version:'1.0.0'}};
 else if(message.method==='ping')result={};
 else if(message.method==='tools/list')result={tools:[{name:'register_deliverable',description:'Explicitly nominate a final file for a deliverable card, after creating or verifying it. Use only for user-facing outcomes, not every edited source file. The host verifies workspace access and existence at turn completion. Ordinary references stay Markdown links.',inputSchema:deliverySchema,annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false}},{name:'update_plan',description:'Maintain the visible task checklist for a complex task. Send the full current plan; update statuses only when actual progress changes. Simple questions do not require a plan.',inputSchema,annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false}}]};
 else if(message.method==='tools/call'&&message.params?.name==='register_deliverable')result=validDelivery(message.params.arguments)?{content:[{type:'text',text:JSON.stringify(message.params.arguments)}]}:{isError:true,content:[{type:'text',text:'Provide a local file path and a short title.'}]};
 else if(message.method==='tools/call'&&message.params?.name==='update_plan')result=validPlan(message.params.arguments)?{content:[{type:'text',text:JSON.stringify(message.params.arguments)}]}:{isError:true,content:[{type:'text',text:'Invalid plan. Provide 1–30 steps with pending, in_progress or completed status.'}]};
 else return {jsonrpc:'2.0',id:message.id,error:{code:-32601,message:'Method not found'}};
 return {jsonrpc:'2.0',id:message.id,result};
}
if(require.main===module)createInterface({input:process.stdin}).on('line',line=>{try{const response=handle(JSON.parse(line));if(response)process.stdout.write(JSON.stringify(response)+'\n');}catch{process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:null,error:{code:-32700,message:'Parse error'}})+'\n');}});
module.exports={validPlan,validDelivery,handle};
