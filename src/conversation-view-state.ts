export type ReadingPosition={turnId:string;offset:number;top:number;following:boolean};
const prefix='amble.reading.v1:';
export function readReading(id:string):ReadingPosition|null{
 try{const r=JSON.parse(sessionStorage.getItem(prefix+id)||'null');return r&&typeof r.turnId==='string'&&Number.isFinite(r.offset)&&Number.isFinite(r.top)&&typeof r.following==='boolean'?r:null;}catch{return null;}
}
export function saveReading(id:string,position:ReadingPosition){try{sessionStorage.setItem(prefix+id,JSON.stringify(position));}catch{/* Reading preferences must not disable the conversation. */}}
