import {createHash} from 'node:crypto';
import {pageItems} from './pagination.cjs';
import {searchRoles} from './role-search.mjs';
export function rolePage(catalog,page){
 const {query='',category='',tag=''}=page;
 if(typeof query!=='string'||query.length>200||typeof category!=='string'||category.length>120||typeof tag!=='string'||tag.length>120)throw Error('STORE_INVALID_PAGE');
 const revision=createHash('sha256').update(JSON.stringify([catalog.snapshotId,catalog.categories,catalog.items])).digest('hex');
 const scoped=searchRoles(catalog.items,query,category);
 const counts=new Map();for(const role of scoped)for(const entry of role.discovery?.tags||[]){const found=counts.get(entry.id);if(found)found.count++;else counts.set(entry.id,{...entry,count:1});}
 const tags=[...counts.values()].sort((a,b)=>b.count-a.count||a.id.localeCompare(b.id));
 const matches=scoped.filter(role=>!tag||role.discovery?.tags.some(entry=>entry.id===tag));
 const result=pageItems(matches,page,[revision,query,category,tag]);
 return {...catalog,...result,pagination:{...result.pagination,tags}};
}
