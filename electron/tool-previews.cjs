const {createHash}=require('node:crypto');
const hash=text=>createHash('sha256').update(text).digest('hex').slice(0,20);
function previewTool(tool){
 if(!['commandExecution','analysis'].includes(tool.type))return tool;
 const {nativeMessages,...value}=tool;
 const text=tool.detail||'';
 return {...value,detail:text.slice(-2048),detailPreview:text.length>2048,detailVersion:hash(text),nativeActivity:tool.nativeActivity?.map(activity=>({...activity,text:activity.text?.slice(-512)||'',textPreview:(activity.text?.length||0)>512,textVersion:hash(activity.text||'')}))};
}
function toolText(run,input){
 const tool=run?.tools.find(tool=>tool.id===input.toolId);if(!tool)throw Error('工具记录不存在');
 const text=input.activityId?tool.nativeActivity?.find(a=>a.id===input.activityId)?.text:tool.detail;
 if(typeof text!=='string')throw Error('工具输出不存在');
 const limit=input.limit??64000;if(!Number.isInteger(limit)||limit<1||limit>64000)throw Error('分页大小无效');
 const offset=input.offset??Math.max(0,text.length-limit);if(!Number.isInteger(offset)||offset<0)throw Error('分页位置无效');
 const start=Math.min(offset,text.length);
 return {text:text.slice(start,start+limit),offset:start,total:text.length,version:hash(text)};
}
module.exports={previewTool,toolText};
