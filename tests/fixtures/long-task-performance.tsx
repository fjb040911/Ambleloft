import './project-space-qa';
const w=window as any,desktop=w.desktop;
const listeners=new Set<(run:any)=>void>();
const counters={configuration:0,spaces:0,legacy:0,snapshots:0,fullReads:0};
const config=desktop.workforce.snapshot,spaces=desktop.spaces.snapshot;
desktop.onRun=()=>{counters.legacy++;return()=>{};};
desktop.onRunEvent=(fn:any)=>{listeners.add(fn);return()=>listeners.delete(fn);};
desktop.getRunSnapshot=async()=>{counters.snapshots++;throw Error('Unexpected snapshot fallback');};
desktop.workforce.snapshot=async()=>{counters.configuration++;return config();};
desktop.spaces.snapshot=async(input:any)=>{
 counters.spaces++;const data=await spaces();
 if(input?.requestIds){counters.fullReads++;data.requests=data.requests.filter((r:any)=>input.requestIds.includes(r.id));for(const r of data.requests)for(const p of r.participants){p.output='FULL BEGIN '+('完整正文 '.repeat(1000))+' FULL END';delete p.outputTruncated;}}
 return data;
};
w.longTaskQA={counters,emit:(run:any)=>{for(const fn of listeners)fn(structuredClone(run));}};
