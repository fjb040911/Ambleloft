// Avoid building a full joined response during frequent list snapshots.
function participantOutput(run,preview=false,limit=2048){
 if(!preview)return {output:run?.messages.filter(m=>m.role==='assistant'&&m.kind!=='reasoning').map(m=>m.text).join('\n\n')||''};
 let output='',outputChars=0,count=0;
 for(const message of run?.messages||[]){
  if(message.role!=='assistant'||message.kind==='reasoning')continue;
  const value=require('../../electron/runtime-text-cache.cjs').preview(message,'text',limit),text=value.text,separator=count++?'\n\n':'';
  outputChars+=separator.length+value.length;
  output=text.length>=limit?text.slice(-limit):(output+separator+text).slice(-limit);
 }
 return {output,outputChars,outputTruncated:outputChars>output.length};
}
module.exports={participantOutput};
