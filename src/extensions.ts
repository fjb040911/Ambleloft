import {useEffect,useState} from 'react';
import type {ExtensionSnapshot} from './types';
const empty:ExtensionSnapshot={capabilities:{},installed:[]};
export function extensionsChanged(){window.dispatchEvent(new Event('extensions:changed'));}
export function openExtensionView(viewId:string){window.dispatchEvent(new CustomEvent('extensions:open',{detail:viewId}));}
export function useExtensions(){
 const [snapshot,setSnapshot]=useState(empty);const [error,setError]=useState('');
 useEffect(()=>{let alive=true;let generation=0;const load=async()=>{const version=++generation;try{const next=await window.desktop?.extensions?.list()||empty;if(alive&&version===generation){setSnapshot(next);setError('');}}catch(e){if(alive&&version===generation)setError((e as Error).message);}};void load();window.addEventListener('extensions:changed',load);return()=>{alive=false;window.removeEventListener('extensions:changed',load);};},[]);
 return {snapshot,error};
}
