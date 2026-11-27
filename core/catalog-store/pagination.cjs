const {createHash}=require('node:crypto');
const normalize=value=>value.normalize('NFKC').trim().toLocaleLowerCase();
function catalogPage(items,page,revision){
 const {query='',kind='all',category='',tag='',limit=24,cursor}=page||{};
 if(typeof query!=='string'||query.length>200||!['all','skill','extension'].includes(kind)||typeof tag!=='string'||tag.length>80||typeof category!=='string'||category.length>120||!Number.isInteger(limit)||limit<1||limit>48)throw Error('STORE_INVALID_PAGE');
 const terms=normalize(query).split(/\s+/).filter(Boolean);
 const scoped=items.filter(item=>kind==='all'||kind===item.kind);
 const available=new Map();
 for (const item of scoped) for (const entry of item.categories) available.set(entry.id,entry);
 const matches=scoped.filter(item=>{
   const names=item.categories.flatMap(({id,title})=>[id,title.zh,title.en]);
   const searchable=normalize([item.title.zh,item.title.en,item.summary.zh,item.summary.en,item.publisher,...item.tags,...names].join(' '));
   return terms.every(term=>searchable.includes(term));
 });
 // Facets span the whole matching snapshot, including items beyond the current page.
 const counts=new Map();
 for (const item of matches) {
   if (!category || item.categories.some(entry=>entry.id===category)) {
     for (const label of new Set(item.tags)) counts.set(label,(counts.get(label)||0)+1);
   }
 }
 const tags=[...counts].map(([label,count])=>({label,count})).sort((a,b)=>b.count-a.count||a.label.localeCompare(b.label));
 const filtered=matches.filter(item=>(!category || item.categories.some(entry=>entry.id===category)) && (!tag||item.tags.includes(tag)));
 const result=pageItems(filtered,{limit,cursor},[revision,query,kind,category,tag]);
 return {...result,pagination:{...result.pagination,tags,categories:[...available.values()].sort((a,b)=>a.id.localeCompare(b.id))}};
}
// Cursors bind the page to its verified snapshot and active filters.
function pageItems(items,{limit=24,cursor}={},identity){
 if(!Number.isInteger(limit)||limit<1||limit>48)throw Error('STORE_INVALID_PAGE');
 const key=createHash('sha256').update(JSON.stringify([identity,limit])).digest('hex');
 let offset=0;
 if(cursor!==undefined&&cursor!==null){try{if(typeof cursor!=='string'||!cursor||cursor.length>512)throw Error();const decoded=JSON.parse(Buffer.from(cursor,'base64url').toString());if(decoded.key!==key)throw Error('STORE_PAGE_CHANGED');if(!Number.isSafeInteger(decoded.offset)||decoded.offset<0||decoded.offset>items.length)throw Error();offset=decoded.offset;}catch(error){throw Error(error.message==='STORE_PAGE_CHANGED'?'STORE_PAGE_CHANGED':'STORE_INVALID_PAGE');}}
 const next=offset+limit;
 return {items:items.slice(offset,next),pagination:{total:items.length,nextCursor:next<items.length?Buffer.from(JSON.stringify({key,offset:next})).toString('base64url'):null}};
}
module.exports={catalogPage,pageItems};
