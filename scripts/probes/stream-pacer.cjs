// Windows may round timers to a coarse tick. When behind, yield to I/O without
// adding another minimum timer tick; the producer can then catch up fairly.
function pace(due,{now=Date.now,timer=setTimeout,immediate=setImmediate}={}){
 const remaining=due-now();return new Promise(resolve=>remaining>0?timer(resolve,remaining):immediate(resolve));
}
module.exports={pace};
