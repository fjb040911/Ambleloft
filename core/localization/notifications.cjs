const L=require('./index.cjs');
function createNotificationLocalization(store,locale){
 const translate=(slot,language)=>L.format(store({action:'get',id:slot.snapshotId}),slot.key,slot.args,language);
 function prepare(input,dictionaries,prior={}){
  const value=structuredClone(input),metadata=structuredClone(prior);
  function slot(raw,max){if(typeof raw==='string')return {text:raw};if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).some(k=>!['key','args'].includes(k))||typeof raw.key!=='string')throw Object.assign(Error('INVALID_ARGUMENT: localized text'),{code:'INVALID_ARGUMENT'});
   const snapshot=L.subset(dictionaries,[raw.key]);const args=raw.args||{};for(const language of ['und',...Object.keys(snapshot).filter(k=>k!=='default')]){const text=L.format(snapshot,raw.key,args,language);if(!text.trim()&&max!==65536||Buffer.byteLength(text)>max)throw Object.assign(Error('INVALID_ARGUMENT: Content size'),{code:'INVALID_ARGUMENT'});}
   if(Buffer.byteLength(JSON.stringify(args))>65536)throw Error('INVALID_ARGUMENT: translation arguments');
   return {text:L.format(snapshot,raw.key,args,locale()),reference:{key:raw.key,args,snapshotId:store({action:'put',dictionaries:snapshot})}};
  }
  for(const [key,max]of [['title',1024],['body',65536]])if(Object.hasOwn(input,key)){const result=slot(input[key],max);value[key]=result.text;if(result.reference)metadata[key]=result.reference;else delete metadata[key];}
  if(Object.hasOwn(input,'actions')){metadata.actions={};value.actions=input.actions.map(a=>{const result=slot(a.label,160);if(result.reference)metadata.actions[a.id]=result.reference;return {...a,label:result.text};});}
  return {value,metadata};
 }
 function render(message){if(!message)return message;const {_localization,...result}=message;if(!_localization)return result;
  for(const key of ['title','body'])if(_localization[key])try{result[key]=translate(_localization[key],locale());}catch{/* Retain last validated text if a legacy snapshot is unavailable. */}
  result.actions=result.actions.map(a=>{try{return {...a,label:_localization.actions?.[a.id]?translate(_localization.actions[a.id],locale()):a.label};}catch{return a;}});return result;
 }
 return {prepare,render};
}
module.exports={createNotificationLocalization};
