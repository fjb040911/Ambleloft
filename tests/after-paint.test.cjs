const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
function fixture(){
 const pending=new Map();let id=0;const compiled={exports:{}};
 new Function('module','requestAnimationFrame','cancelAnimationFrame',require('esbuild').transformSync(fs.readFileSync('src/after-paint.ts','utf8'),{loader:'ts',format:'cjs'}).code)(compiled,callback=>{pending.set(++id,callback);return id;},id=>pending.delete(id));
 const frame=()=>{const batch=[...pending];for(const[id,callback]of batch){pending.delete(id);callback();}};
 return{afterPaint:compiled.exports.afterPaint,frame,pending};
}
test('native chrome style reads wait until a rendering opportunity has passed',()=>{const f=fixture();let reads=0;f.afterPaint(()=>reads++);assert.equal(reads,0);f.frame();assert.equal(reads,0);f.frame();assert.equal(reads,1);f.frame();assert.equal(reads,1);});
test('unmount cancels both pending first-frame and second-frame work',()=>{for(const afterFirst of [false,true]){const f=fixture();let reads=0;const cancel=f.afterPaint(()=>reads++);if(afterFirst)f.frame();cancel();f.frame();f.frame();assert.equal(reads,0);assert.equal(f.pending.size,0);}});
test('rapid theme replacement cannot deliver a stale native chrome update',()=>{const f=fixture(),colors=[];const old=f.afterPaint(()=>colors.push('old'));f.frame();old();f.afterPaint(()=>colors.push('latest'));f.frame();assert.deepEqual(colors,[]);f.frame();assert.deepEqual(colors,['latest']);});
