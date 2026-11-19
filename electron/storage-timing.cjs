// Worker-local, bounded numeric timings. Nested stages are inclusive, not additive.
let current=null;
function begin(){current={};}
function measure(name,fn){const start=performance.now();try{return fn();}finally{if(current)current[name]=(current[name]||0)+performance.now()-start;}}
function take(){const result=current||{};current=null;return result;}
module.exports={begin,measure,take};
