const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const {validateDiscovery}=require('../core/catalog-store/role-discovery.cjs');
const {legacyRoles}=require('../core/catalog-store/expert-contract.cjs');
const out={};new Function('exports',ts.transpileModule(fs.readFileSync('src/role-discovery.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(out);
const authored=require('../specs/workforce/examples/expert-roles.authoring.json').roles;
const roles=legacyRoles({roles:authored.map(r=>({...r,skills:[]})),skills:[],recommendations:[]},'test');
const ids=(q,c='',t='')=>out.searchRoles(roles,q,c,t).map(r=>r.id);
test('bilingual aliases, NFKC, AND words, ranking and short Latin word boundaries',()=>{
 assert.deepEqual(ids('ＰＭ'),['amble.product']);assert.deepEqual(ids('PRODUCT manager'),['amble.product']);assert.equal(ids('架构师')[0],'amble.architecture');
 assert.deepEqual(ids('PM 需求'),['amble.product']);assert.deepEqual(ids('PM 故障排查'),[]);assert.ok(ids('API').includes('amble.integration'));assert.equal(ids('operations')[0],'amble.devops');assert.deepEqual(ids('zzz-does-not-exist'),[]);
});
test('category and tag filters compose without mutating the catalog',()=>{
 const before=structuredClone(roles);assert.deepEqual(ids('','quality'),['amble.qa']);assert.deepEqual(ids('','content'),['amble.copy','amble.tutorial']);
 assert.deepEqual(ids('','engineering','api-design'),['amble.architecture','amble.integration']);assert.deepEqual(ids('','missing'),[]);assert.deepEqual(roles,before);
});
test('personal discovery is searched locally; absent metadata does not infer template defaults',()=>{
 const expert={...roles[0].zh,name:'My specialist',skills:[],discovery:{categoryIds:['engineering'],tags:[{id:'fpga',title:{'zh-CN':'芯片验证',en:'Chip verification'}}],keywords:{'zh-CN':['芯片'],'en':['FPGA','GDB']}}};
 assert.deepEqual(out.searchRoles([expert],'gdb'),[expert]);assert.deepEqual(out.searchRoles([expert],'PM'),[]);
 const old={...expert,discovery:undefined};assert.deepEqual(out.searchRoles([old],'FPGA'),[]);assert.equal(out.searchRoles([old],'My specialist').length,1);
});
test('discovery schema bounds and identity validation reject malformed metadata',()=>{
 const d=roles[0].discovery;assert.deepEqual(validateDiscovery(d),d);
 for(const invalid of [{...d,categoryIds:['product','product']},{...d,tags:[d.tags[0],d.tags[0]]},{...d,keywords:{en:['PM','pm'],'zh-CN':[]}},{...d,tags:[{id:'x',title:{en:'Only English'}}]},{...d,keywords:{en:Array(31).fill('a'),'zh-CN':[]}}])assert.throws(()=>validateDiscovery(invalid),/ROLE_DISCOVERY_INVALID/);
 assert.equal(authored.length,10);for(const r of authored)validateDiscovery(r);
});
