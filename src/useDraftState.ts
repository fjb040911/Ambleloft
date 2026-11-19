import {useCallback,useRef,useState,type Dispatch,type SetStateAction} from 'react';
import type {ComposerOptions} from './ComposerControls';
import type {Task} from './types';

const prefix='amble.composer-draft.v1:';
export function writeDraft(key:string,value:unknown){if(value===''||value===undefined)sessionStorage.removeItem(prefix+key);else sessionStorage.setItem(prefix+key,JSON.stringify(value));}
export function restoreTaskDraft(value:unknown):Task|null{
 if(!value||typeof value!=='object')return null;
 const draft=value as Task;
 return typeof draft.id==='string'&&typeof draft.prompt==='string'&&typeof draft.title==='string'&&draft.status==='draft'?draft:null;
}
export function restoreComposerOptions(value:unknown,initial:ComposerOptions):ComposerOptions{
 if(!value||typeof value!=='object')return initial;
 const saved=value as ComposerOptions;
 return {...initial,
  attachments:Array.isArray(saved.attachments)?saved.attachments.filter(f=>f&&typeof f.path==='string'&&typeof f.name==='string').slice(0,50):initial.attachments,
  selectedSkillIds:Array.isArray(saved.selectedSkillIds)?saved.selectedSkillIds.filter(id=>typeof id==='string').slice(0,20):initial.selectedSkillIds,
  employeeId:typeof saved.employeeId==='string'?saved.employeeId:initial.employeeId,
 };
}
function read<T>(key:string,initial:T,restore?:(value:unknown,initial:T)=>T):T{
 try{const raw=sessionStorage.getItem(prefix+key);if(raw===null)return initial;const value:unknown=JSON.parse(raw);return restore?restore(value,initial):typeof value===typeof initial?value as T:initial;}catch{return initial;}
}
// Persist in the input event, not a delayed effect: an immediate reload must see
// the final keystroke. Session storage isolates windows while surviving reloads.
export function useDraftState<T>(key:string,initial:T,restore?:(value:unknown,initial:T)=>T):[T,Dispatch<SetStateAction<T>>,string]{
 const [state,setState]=useState(()=>({key,value:read(key,initial,restore),error:''}));
 const active=useRef(state);
 let current=state;
 if(state.key!==key){current={key,value:read(key,initial,restore),error:''};setState(current);}
 active.current=current;
 const update=useCallback<Dispatch<SetStateAction<T>>>(action=>{
  const previous=active.current.key===key?active.current.value:read(key,initial,restore);
  const value=typeof action==='function'?(action as (previous:T)=>T)(previous):action;
  let error='';
  try{writeDraft(key,value);}catch{error='草稿暂时无法保存，刷新前请先复制输入内容。';}
  const next={key,value,error};
  // A late send result belongs to its original conversation, not the new view.
  if(active.current.key===key){active.current=next;setState(next);}
 },[key]);
 return [current.value,update,current.error];
}
