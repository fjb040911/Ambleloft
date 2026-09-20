import { useSyncExternalStore } from 'react';
import english from './en.json';
let language='zh-CN';
const listeners=new Set<()=>void>();
export function setLanguage(value:'system'|'zh-CN'|'en') { const next=value==='system'?(navigator.language.toLowerCase().startsWith('zh')?'zh-CN':'en'):value;document.documentElement.lang=next;if(next!==language){language=next;listeners.forEach(fn=>fn());} }
export function useLanguage(){return useSyncExternalStore(fn=>{listeners.add(fn);return()=>{listeners.delete(fn);}},()=>language);}
export function t(text:string):string {return language==='en'?(english as Record<string,string>)[text]??text:text;}
