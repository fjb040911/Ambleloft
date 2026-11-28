import {useEffect,useMemo} from 'react';
import type {StoreAPI,StoreCatalog,StorePage} from './types';
import {usePagedCatalog} from './usePagedCatalog';
const empty:StoreCatalog={source:null,items:[],stale:true,installed:[],busy:[]};
export function useStoreCatalog(api:StoreAPI|undefined,filters:StorePage,discover:boolean){
 const fetchPage=useMemo(()=>{
  if(!api)return;
  let refreshOnEntry=discover;
  return (input:{refresh?:boolean;page:StorePage})=>{
   if(refreshOnEntry&&!input.page.cursor){
    refreshOnEntry=false;
    return api.catalog({...input,refresh:true});
   }
   return api.catalog({...input,localOnly:!discover});
  };
 },[api,discover]);
 const state=usePagedCatalog(fetchPage,filters,empty),{reload}=state;
 useEffect(()=>{const refresh=()=>void reload();const off=api?.onChanged(refresh);window.addEventListener('skills-changed',refresh);window.addEventListener('extensions:changed',refresh);return()=>{off?.();window.removeEventListener('skills-changed',refresh);window.removeEventListener('extensions:changed',refresh);};},[api,reload]);
 return state;
}
