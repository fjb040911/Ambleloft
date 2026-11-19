// CSwitch.CallStack() is the stack of the thread GETTING the CPU (TraceEvent).
const fs=require('node:fs');
function analyzeWaits(text){
const lastOut=new Map(),waits=[];
for(const block of text.split(/^EVENT\t/m).slice(1)){
 const header=block.split('\n')[0].split('\t'),time=Date.parse(header[0]),sw=block.match(/SWITCH\toldTid=(\d+)\tnewTid=(\d+)\twait=([^\t]+)\tstate=([^\r\n]+)/);if(!sw)continue;
 const old=Number(sw[1]),next=Number(sw[2]),prior=lastOut.get(next);
 if(prior&&time-prior.time>=20)waits.push({at:header[0],thread:next,ms:time-prior.time,previousState:prior.state,previousWait:prior.wait,stack:block.split('\n').filter(l=>l.startsWith('  ')).map(l=>l.trim())});
 lastOut.delete(next);lastOut.set(old,{time,state:sw[4],wait:sw[3]});
}
return waits;
}
module.exports={analyzeWaits};
if(require.main===module){const raw=fs.readFileSync(process.argv[2]);const waits=analyzeWaits(raw[0]===255&&raw[1]===254?raw.toString('utf16le'):raw.toString('utf8'));fs.writeFileSync(process.argv[3],JSON.stringify(waits,null,2));console.log(JSON.stringify(waits.map(w=>({...w,stack:w.stack.slice(0,14)})),null,2));}
