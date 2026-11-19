// Reading layout-dependent styles in the first frame can flush the entire React
// commit. The second animation frame runs after a rendering opportunity.
export function afterPaint(callback:()=>void) {
 let second:number|undefined;
 const first=requestAnimationFrame(()=>{second=requestAnimationFrame(callback);});
 return ()=>{cancelAnimationFrame(first);if(second!==undefined)cancelAnimationFrame(second);};
}
