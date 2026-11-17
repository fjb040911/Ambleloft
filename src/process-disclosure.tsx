import {createContext,useContext,useRef,useState,type ReactNode} from 'react';

// Keep only disclosure choices across unmounts, never hidden transcript trees.
const DisclosureContext=createContext<Map<string,boolean>|null>(null);
export function ProcessDisclosureScope({children}:{children:ReactNode}){
 const parent=useContext(DisclosureContext);
 const choices=useRef(new Map<string,boolean>());
 return <DisclosureContext.Provider value={parent||choices.current}>{children}</DisclosureContext.Provider>;
}
export function useProcessDisclosure(key?:string,defaultOpen=false){
 const choices=useContext(DisclosureContext);
 const [open,setOpen]=useState(()=>key?choices?.get(key)??defaultOpen:defaultOpen);
 const change=(value:boolean)=>{if(key)choices?.set(key,value);setOpen(value);};
 return [open,change] as const;
}
