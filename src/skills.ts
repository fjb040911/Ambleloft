import {useEffect,useSyncExternalStore} from 'react';
import type {Skill} from './types';
let snapshot:{skills:Skill[];error:string}={skills:[],error:''};
let loaded=false;let pending:Promise<void>|null=null;
const listeners=new Set<()=>void>();
function reload(){
 if(pending||!window.desktop?.skills)return;
 pending=window.desktop.skills.list().then(skills=>{snapshot={skills,error:''};loaded=true;}).catch(e=>{snapshot={...snapshot,error:e.message};}).finally(()=>{pending=null;listeners.forEach(fn=>fn());});
}
function subscribe(listener:()=>void){listeners.add(listener);if(listeners.size===1){window.addEventListener('skills-changed',reload);window.addEventListener('focus',reload);}return()=>{listeners.delete(listener);if(!listeners.size){window.removeEventListener('skills-changed',reload);window.removeEventListener('focus',reload);}};}
export function useSkills(){const value=useSyncExternalStore(subscribe,()=>snapshot);useEffect(()=>{if(!loaded)reload();},[]);return value;}
export const skillsChanged=()=>{loaded=false;window.dispatchEvent(new Event('skills-changed'));};
