import {createContext,useContext,useRef,useState,type ReactNode} from 'react';

// Keep only disclosure choices across unmounts, never hidden transcript trees.
const DisclosureContext=createContext<Map<string,boolean>|null>(null);
export function ProcessDisclosureScope({children,storageKey}:{children:ReactNode;storageKey?:string}){
 const parent=useContext(DisclosureContext);
 const choices=useRef<Map<string,boolean>|null>(null);
 if(!choices.current){
  const key=storageKey?'amble.disclosures.v1:'+storageKey:null;let entries:[string,boolean][]=[];
  try{const saved=key&&JSON.parse(sessionStorage.getItem(key)||'[]');if(Array.isArray(saved))entries=saved.filter(v=>Array.isArray(v)&&typeof v[0]==='string'&&typeof v[1]==='boolean').slice(-300);}catch{}
  const map=new Map(entries);if(key)map.set=(id,open)=>{Map.prototype.set.call(map,id,open);while(map.size>300)map.delete(map.keys().next().value!);try{sessionStorage.setItem(key,JSON.stringify([...map]));}catch{}return map;};choices.current=map;
 }
 return <DisclosureContext.Provider value={storageKey?choices.current:parent||choices.current}>{children}</DisclosureContext.Provider>;
}
export function useProcessDisclosure(key?:string,defaultOpen=false){
 const choices=useContext(DisclosureContext);
 const [open,setOpen]=useState(()=>key?choices?.get(key)??defaultOpen:defaultOpen);
 const change=(value:boolean)=>{if(key)choices?.set(key,value);setOpen(value);};
 return [open,change] as const;
}
