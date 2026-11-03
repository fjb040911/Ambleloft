import {useEffect,useSyncExternalStore} from 'react';
import type {Skill} from './types';
let snapshot:{skills:Skill[];systemSkills:Skill[];error:string}={skills:[],systemSkills:[],error:''};
let loaded=false;let pending:Promise<void>|null=null;
let offHost:(()=>void)|undefined;
const listeners=new Set<()=>void>();
function reload(){
 if(pending||!window.desktop?.skills)return;
 pending=Promise.all([window.desktop.skills.list(),window.desktop.skills.listSystem?.().catch(error=>{if(/No handler registered for ['"]skills:listSystem['"]/.test(error.message))return [];throw error;})||Promise.resolve([])]).then(([skills,systemSkills])=>{snapshot={skills,systemSkills,error:''};loaded=true;}).catch(e=>{snapshot={...snapshot,error:e.message};}).finally(()=>{pending=null;listeners.forEach(fn=>fn());});
}
function subscribe(listener:()=>void){listeners.add(listener);if(listeners.size===1){offHost=window.desktop?.skills?.onChanged?.(()=>{loaded=false;reload();});window.addEventListener('skills-changed',reload);window.addEventListener('focus',reload);}return()=>{listeners.delete(listener);if(!listeners.size){offHost?.();offHost=undefined;window.removeEventListener('skills-changed',reload);window.removeEventListener('focus',reload);}};}
export function useSkills(){const value=useSyncExternalStore(subscribe,()=>snapshot);useEffect(()=>{if(!loaded)reload();},[]);return value;}
export const skillsChanged=()=>{loaded=false;window.dispatchEvent(new Event('skills-changed'));};
