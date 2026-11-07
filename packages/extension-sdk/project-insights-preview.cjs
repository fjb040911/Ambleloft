'use strict';
function getProjectInsights(context){
 const value=context?.projectInsights;
 if(context?.capabilities?.projectInsights!==1||typeof value?.projects?.list!=='function'||typeof value?.activity?.list!=='function'||typeof value?.usage?.list!=='function'||['policy','prepare','get','cancel'].some(m=>typeof value?.summaries?.[m]!=='function'))throw Object.assign(Error('Project insights require a compatible host.'),{code:'UNSUPPORTED'});
 return value;
}
function aggregateUsage(records){
 const rows=new Map();for(const row of records){const prior=rows.get(row.id);if(!prior||(row.revision||0)>(prior.revision||0))rows.set(row.id,row);}
 const result={requests:rows.size,unknownRequests:0,input:{known:0,complete:true},output:{known:0,complete:true},total:{known:0,complete:true}};
 for(const row of rows.values()){if(row.quality!=='reported')result.unknownRequests++;for(const key of ['input','output','total']){const n=row.counts?.[key];if(Number.isSafeInteger(n)&&n>=0)result[key].known+=n;else result[key].complete=false;}}
 return result;
}
module.exports={getProjectInsights,aggregateUsage};
