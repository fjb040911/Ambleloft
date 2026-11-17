// node --expose-gc scripts/benchmark-active-text.cjs [MiB per field]
const {TextSpool,append}=require('../electron/text-spool.cjs'),{pageRun}=require('../electron/history-pages.cjs'),{createRunPublisher}=require('../electron/run-events.mjs'),{RunDelivery}=require('../electron/run-delivery.cjs'),{packets}=require('../electron/stream-json.cjs');
const mib=Number(process.argv[2]||16),store=new TextSpool(),publisher=createRunPublisher('benchmark'),samples=[];
const run={id:'benchmark',status:'running',messages:[{id:'u',role:'user',text:'fixture'},{id:'a',role:'assistant',text:''}],tools:Array.from({length:3},(_,i)=>({id:'child-'+i,turnKey:'u',type:'analysis',status:'running',detail:''})),approvals:[],questions:[]};
let frames=0;const delivery=new RunDelivery(()=>frames++,id=>publisher.snapshot(id));delivery.reset();
const chunk='中文😀 abc\n'.repeat(8192),target=mib*1024*1024/2,started=performance.now();
try{
 for(let length=0;length<target;length+=chunk.length){const text=chunk.slice(0,Math.min(chunk.length,target-length));append(run.messages[1],'text',text,store);for(const tool of run.tools)append(tool,'detail',text,store);delivery.push(publisher.encode(pageRun(run)));if(length===0||length+chunk.length>=target/2&&samples.length===1||length+chunk.length>=target){global.gc?.();samples.push({charactersPerField:Math.min(target,length+chunk.length),...process.memoryUsage()});}}
 let serializedBytes=0,maxPacketBytes=0;for(const packet of packets({type:'response.completed',response:run})){serializedBytes+=packet.length;maxPacketBytes=Math.max(maxPacketBytes,packet.length);}
 console.log(JSON.stringify({mibPerField:mib,fields:4,elapsedMs:Math.round(performance.now()-started),samples,serializedBytes,maxPacketBytes,queuedFrames:frames,delivery:delivery.stats(),publisher:publisher.stats(),pendingSpoolBytes:store.bytes},null,2));
}finally{delivery.close();store.close();}
