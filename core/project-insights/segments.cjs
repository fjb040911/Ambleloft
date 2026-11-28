// Offsets refer to the authorized, conversation-only snapshot, never the raw transcript.
function sliceTurn(turn, part) {
 if (typeof part === 'number' || part.message === undefined) return turn;
 const {message,start,end}=part;
 const item=turn.messages[message];
 return {...turn,messages:[{...item,text:item.text.slice(start,end)}]};
}
const sourceIndex=part=>typeof part==='number'?part:part.ref;
function createBatchPlanner(limit=44000) {
 const batches=[];let batch=[],bytes=2;
 function add(part,size){
  if(batch.length && (batch.length===10 || bytes+size>limit)){batches.push(batch);batch=[];bytes=2;}
  batch.push(part);bytes+=size;
 }
 function addTurn(turn,ref,page){
  const location=page===undefined?{ref}:{ref,page};
  const size=value=>Buffer.byteLength(JSON.stringify(value))+24;
  const bytes=size(turn);
  if(bytes<=limit){add(page===undefined?ref:location,bytes);return;}
  for(const [message,item] of turn.messages.entries()){
   let start=0;
   while(start<item.text.length){
    let lo=start+1,hi=Math.min(start+limit,item.text.length),end=start;
    while(lo<=hi){const mid=Math.floor((lo+hi)/2);
     if(size(sliceTurn(turn,{message,start,end:mid}))<=limit){end=mid;lo=mid+1;}else hi=mid-1;}
    if(end<item.text.length){
     const newline=item.text.lastIndexOf('\n',end-1);
     if(newline>=start+(end-start)/2)end=newline+1;
     if(/[\uD800-\uDBFF]/.test(item.text.charAt(end-1)))end--;
    }
    if(end<=start)throw Object.assign(Error('RANGE_TOO_LARGE'),{code:'RANGE_TOO_LARGE'});
    const part={...location,message,start,end};add(part,size(sliceTurn(turn,part)));start=end;
   }
  }
 }
 return {addTurn,finish:()=>batch.length?[...batches,batch]:batches};
}
module.exports={createBatchPlanner,sliceTurn,sourceIndex};
