declare module '*run-events.mjs' {
 export function retainedBytes(value:any):number;
 export function applyRunEvent(current:any,event:any):any;
}
declare module '*markdown-blocks.mjs' {
 export function createMarkdownSplitter():(text:string)=>string[];
}
