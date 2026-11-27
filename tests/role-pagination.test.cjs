const {test,before}=require('node:test'),assert=require('node:assert/strict');
const {WorkforceService}=require('../core/workforce/service.cjs');
let rolePage;before(async()=>{({rolePage}=await import('../core/catalog-store/role-pagination.mjs'));});
const catalog=()=>({snapshotId:'snapshot-1',categories:[{id:'engineering',title:{'zh-CN':'研发',en:'Engineering'}}],stale:false,items:Array.from({length:61},(_,i)=>({id:'role-'+i,version:'1.0.0',zh:{name:'测试角色 '+i},en:{name:'Test role '+i},skills:[],discovery:{categoryIds:[i%2?'content':'engineering'],tags:[{id:i%2?'writing':'research',title:{'zh-CN':i%2?'写作':'研究',en:i%2?'Writing':'Research'}}],keywords:{'zh-CN':[],en:i===60?['Final specialist']:[]}}}))});
test('role pages bound host responses and retain complete metadata; legacy callers still work',async()=>{
 const service=Object.create(WorkforceService.prototype),value=catalog();service.roleQueue=Promise.resolve();service.loadRoles=async()=>value;
 const first=await service.roles({page:{}});assert.equal(first.items.length,24);assert.equal(first.pagination.total,61);assert.deepEqual(first.categories,value.categories);
 const second=await service.roles({page:{cursor:first.pagination.nextCursor}}),last=await service.roles({page:{cursor:second.pagination.nextCursor}});
 assert.equal(second.items.length,24);assert.equal(last.items.length,13);assert.equal(last.pagination.nextCursor,null);assert.equal(new Set([...first.items,...second.items,...last.items].map(r=>r.id)).size,61);
 assert.equal((await service.roles()).items.length,61);assert.equal((await service.roles(null)).items.length,61);
});
test('search, categories and tags filter the full catalog before paging',()=>{
 const value=catalog();assert.deepEqual(rolePage(value,{query:'ＦＩＮＡＬ specialist'}).items.map(r=>r.id),['role-60']);
 const engineering=rolePage(value,{category:'engineering',tag:'research'});assert.equal(engineering.pagination.total,31);assert.equal(engineering.items.length,24);assert.ok(engineering.items.every(r=>Number(r.id.split('-')[1])%2===0));
 assert.equal(rolePage(value,{query:'missing'}).pagination.total,0);
});
test('invalid cursors, changed filters and revised catalogs cannot append incompatible pages',()=>{
 const value=catalog(),cursor=rolePage(value,{}).pagination.nextCursor;
 for(const page of [{limit:100},{limit:0},{query:[]},{category:7},{tag:'x'.repeat(121)},{cursor:''},{cursor:'bad'}])assert.throws(()=>rolePage(value,page),/STORE_INVALID_PAGE/);
 assert.throws(()=>rolePage(value,{cursor,category:'engineering'}),/STORE_PAGE_CHANGED/);
 value.items.reverse();assert.throws(()=>rolePage(value,{cursor}),/STORE_PAGE_CHANGED/);
});

test('tag facets include unseen pages and respect search/category without shrinking to the selected tag',()=>{
 const value=catalog();value.items[60].discovery.tags.push({id:'last-only',title:{'zh-CN':'末页专属',en:'Last page only'}});
 const first=rolePage(value,{});assert.equal(first.pagination.tags.find(t=>t.id==='last-only').count,1);assert.equal(first.pagination.tags.find(t=>t.id==='research').count,31);
 const selected=rolePage(value,{tag:'last-only'});assert.equal(selected.items[0].id,'role-60');assert.deepEqual(selected.pagination.tags,first.pagination.tags);
 assert.deepEqual(rolePage(value,{category:'content'}).pagination.tags.map(t=>t.id),['writing']);
 assert.ok(rolePage(value,{query:'Final specialist'}).pagination.tags.every(t=>t.count===1));
});
