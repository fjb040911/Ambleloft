import {useCallback,useEffect,useRef,useState} from 'react';
const PAGE_SIZE=24;
type Page={query?:string;limit?:number;cursor?:string};
type Catalog={items:{id:string}[];pagination?:{nextCursor:string|null};error?:string};
// Shared by both catalogs: bounded requests, debounced search and stale-response protection.
export function usePagedCatalog<C extends Catalog,F extends Page>(fetchPage:((input:{refresh?:boolean;page:F})=>Promise<C>)|undefined,filters:F,empty:C){
 const key=JSON.stringify(filters),[catalog,setCatalog]=useState<C>(empty),[loading,setLoading]=useState(!!fetchPage),[loadingMore,setLoadingMore]=useState(false),[error,setError]=useState(''),[pageError,setPageError]=useState('');
 const epoch=useRef(0),current=useRef({fetchPage,filters,key}),moreBusy=useRef(false);current.current={fetchPage,filters,key};
 const reload=useCallback(async(refresh=false)=>{
  const {fetchPage,filters,key}=current.current;if(!fetchPage)return;
  const ticket=++epoch.current;moreBusy.current=false;setLoadingMore(false);setPageError('');setLoading(true);
  try{const result=await fetchPage({refresh,page:{...filters,limit:PAGE_SIZE}});if(ticket===epoch.current&&key===current.current.key){setCatalog(result);setError('');}}
  catch(e){if(ticket===epoch.current&&key===current.current.key)setError((e as Error).message);}
  finally{if(ticket===epoch.current&&key===current.current.key)setLoading(false);}
 },[]);
 useEffect(()=>{epoch.current++;moreBusy.current=false;setLoadingMore(false);setCatalog(empty);setLoading(!!fetchPage);setError('');setPageError('');const timer=setTimeout(()=>void reload(),filters.query?250:0);return()=>{clearTimeout(timer);epoch.current++;};},[fetchPage,key,reload,empty]);
 const loadMore=useCallback(async()=>{
  const cursor=catalog.pagination?.nextCursor;if(!fetchPage||!cursor||moreBusy.current||loading)return;
  const ticket=epoch.current,requestKey=key;moreBusy.current=true;setLoadingMore(true);setPageError('');
  try{const result=await fetchPage({page:{...filters,limit:PAGE_SIZE,cursor}});if(ticket!==epoch.current||requestKey!==current.current.key)return;if(result.error)throw Error(result.error);setCatalog(previous=>({...result,items:[...previous.items,...result.items.filter(item=>!previous.items.some(old=>old.id===item.id))]}));}
  catch(e){if(ticket===epoch.current&&requestKey===current.current.key)setPageError((e as Error).message);}
  finally{if(ticket===epoch.current&&requestKey===current.current.key){moreBusy.current=false;setLoadingMore(false);}}
 },[fetchPage,catalog.pagination?.nextCursor,loading,key]);
 return {catalog,loading,loadingMore,error,setError,pageError,reload,loadMore};
}
