// Self-contained so Playwright can serialize it into an isolated renderer.
function observeFrames(){
 const w=window;if(w.__soakFrames)return;
 w.__soakFrames={count:0,maxMs:0,over50:0,longTasks:0,longTaskMaxMs:0};
 let previous,suspended=false;
 w.__soakFrameVisibility=value=>{suspended=value;previous=undefined;};
 const tick=now=>{
  if(suspended){previous=undefined;}else{
   if(previous!==undefined){const ms=now-previous;w.__soakFrames.count++;w.__soakFrames.maxMs=Math.max(w.__soakFrames.maxMs,ms);if(ms>50)w.__soakFrames.over50++;}
   previous=now;
  }
  requestAnimationFrame(tick);
 };
 document.addEventListener('visibilitychange',()=>w.__soakFrameVisibility(document.visibilityState==='hidden'));
 requestAnimationFrame(tick);
 new PerformanceObserver(list=>{for(const e of list.getEntries()){w.__soakFrames.longTasks++;w.__soakFrames.longTaskMaxMs=Math.max(w.__soakFrames.longTaskMaxMs,e.duration);}}).observe({type:'longtask',buffered:false});
}
module.exports={observeFrames};
