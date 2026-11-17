// Discovery metadata never grants skills or permissions. Shared by catalog and profiles.
const ID=/^[a-z0-9][a-z0-9._-]{0,119}$/;
function validateDiscovery(value) {
  const fail=()=>{throw Error('ROLE_DISCOVERY_INVALID');};
  if(!value||typeof value!=='object'||Array.isArray(value))fail();
  const list=(items,max,check)=>{
    if(!Array.isArray(items)||items.length>max||items.some(v=>!check(v))||new Set(items.map(v=>typeof v==='string'?v.normalize('NFKC').toLowerCase():v.id)).size!==items.length)fail();
  };
  const label=v=>typeof v==='string'&&!!v.trim()&&v===v.trim()&&v.length<=80;
  list(value.categoryIds,7,v=>typeof v==='string'&&ID.test(v));
  list(value.tags,12,t=>t&&typeof t.id==='string'&&ID.test(t.id)&&label(t.title?.['zh-CN'])&&label(t.title?.en));
  if(!value.keywords||typeof value.keywords!=='object')fail();
  for(const lang of ['zh-CN','en'])list(value.keywords[lang],30,label);
  return {categoryIds:[...value.categoryIds],tags:value.tags.map(t=>({id:t.id,title:{'zh-CN':t.title['zh-CN'],en:t.title.en}})),keywords:{'zh-CN':[...value.keywords['zh-CN']],en:[...value.keywords.en]}};
}
module.exports={validateDiscovery};
