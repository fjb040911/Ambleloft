// Avoid building a full joined response during frequent list snapshots.
function participantOutput(run,preview=false){
 if(!preview)return {output:run?.messages.filter(m=>m.role==='assistant'&&m.kind!=='reasoning').map(m=>m.text).join('\n\n')||''};
 let output='',outputChars=0,count=0;
 for(const message of run?.messages||[]){
  if(message.role!=='assistant'||message.kind==='reasoning')continue;
  const value=require('../../electron/runtime-text-cache.cjs').preview(message,'text',2048),text=value.text,separator=count++?'\n\n':'';
  outputChars+=separator.length+value.length;
  output=text.length>=2048?text.slice(-2048):(output+separator+text).slice(-2048);
 }
 return {output,outputChars,outputTruncated:outputChars>output.length};
}
module.exports={participantOutput};
