const {createHash}=require('node:crypto');
const hash=text=>createHash('sha256').update(text).digest('hex').slice(0,20);
const {preview}=require('./runtime-text-cache.cjs');
function previewTool(tool){
 if(!['commandExecution','analysis','mcpToolCall'].includes(tool.type))return tool;
 // Structured input/form/app records are consumed as protocols, not plain output.
 if(tool.type==='mcpToolCall'&&/(?:^|[/:])(?:input_|forms_|ui_)/.test(tool.label||''))return tool;
 const value={};for(const key of Object.keys(tool))if(!['nativeMessages','detail','nativeActivity'].includes(key))value[key]=tool[key];
 const detail=preview(tool,'detail',2048);
 return {...value,detail:detail.text,detailPreview:detail.length>detail.text.length,detailVersion:detail.version,nativeActivity:tool.nativeActivity?.map(activity=>{const text=preview(activity,'text',512);const value={};for(const key of Object.keys(activity))if(key!=='text')value[key]=activity[key];return {...value,text:text.text,textPreview:text.length>text.text.length,textVersion:text.version};})};
}
function toolText(run,input){
 const tool=run?.tools.find(tool=>tool.id===input.toolId);if(!tool)throw Error('工具记录不存在');
 const owner=input.activityId?tool.nativeActivity?.find(a=>a.id===input.activityId):tool;if(!owner)throw Error('工具输出不存在');return require('./runtime-text-cache.cjs').range(owner,input.activityId?'text':'detail',input.offset,input.limit);
}
module.exports={previewTool,toolText};
