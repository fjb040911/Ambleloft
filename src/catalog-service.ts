import {useEffect,useState} from 'react';
import {models,capabilities} from './catalog';
import type {Model,Capability} from './types';
export interface CatalogCategory {id:string;label:string}
export interface PluginListing {id:string;name:string;description:string;publisher:string;category:string;version:string;skillIds:string[];permissions:string[]}
export interface CatalogSkill extends Capability {categoryId:string;kind:'template'}
export interface CatalogSnapshot {version:1;revision:string;models:Model[];skills:CatalogSkill[];plugins:PluginListing[];categories:CatalogCategory[]}
/** Directory metadata only. Installation, permissions and runtime state belong to the device store. */
export interface CatalogSource {load(signal:AbortSignal):Promise<CatalogSnapshot>}
const categories:CatalogCategory[]=[{id:'design',label:'设计创作'},{id:'productivity',label:'效率工具'},{id:'knowledge',label:'知识工作'}];
const bundled:CatalogSnapshot={version:1,revision:'bundled-2026-09-14',models,skills:capabilities.map(skill=>({...skill,categoryId:categories.find(c=>c.label===skill.category)!.id,kind:'template'})),plugins:[],categories};
export const bundledCatalogSource:CatalogSource={async load(signal){signal.throwIfAborted();return structuredClone(bundled);}};
export interface CatalogDirectory {data:CatalogSnapshot;loading:boolean;error:string;reload():void}
export function useCatalog(source:CatalogSource=bundledCatalogSource):CatalogDirectory {
 const [data,setData]=useState(bundled);const [loading,setLoading]=useState(true);const [error,setError]=useState('');const [revision,setRevision]=useState(0);
 useEffect(()=>{const controller=new AbortController();setLoading(true);setError('');source.load(controller.signal).then(next=>{if(controller.signal.aborted)return;if(next.version!==1)throw new Error('Unsupported catalog version');setData(next);}).catch(()=>{if(!controller.signal.aborted)setError('目录更新失败，正在显示上次可用内容。');}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});return()=>controller.abort();},[source,revision]);
 return {data,loading,error,reload:()=>setRevision(n=>n+1)};
}
