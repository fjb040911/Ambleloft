const {test}=require('node:test');const assert=require('node:assert/strict');const {transformSync}=require('esbuild');const fs=require('node:fs');
const moduleValue={exports:{}};new Function('module',transformSync(fs.readFileSync('src/file-reference.ts','utf8'),{loader:'ts',format:'cjs'}).code)(moduleValue);const {fileDirectoryHints}=moduleValue.exports;
test('directory hints disambiguate the whole instance without changing raw paths',()=>{
 const paths=['src/billing/shared/components/Settings.tsx','src/organization/shared/components/Settings.tsx','src/billing/shared/components/Settings.tsx','Settings.tsx','shared/components/Settings.tsx','src/财务报销/申请表单/核验.tsx'];const hints=fileDirectoryHints(paths);
 assert.equal(hints.size,5);assert.equal(hints.get(paths[0]),'…/billing/shared/components');assert.equal(hints.get(paths[1]),'…/organization/shared/components');assert.equal(hints.get('Settings.tsx'),'项目根目录');assert.equal(hints.get('shared/components/Settings.tsx'),'shared/components');assert.equal(hints.get(paths[5]),'…/财务报销/申请表单');
 assert.equal(new Set([paths[0],paths[1],paths[3],paths[4]].map(p=>hints.get(p))).size,4);
 assert.deepEqual([...fileDirectoryHints([...paths].reverse())].sort(),[...hints].sort());
 assert.equal(fileDirectoryHints(['src/a/file.ts','src/b/file.ts']).get('src/a/file.ts'),'…/a');
});
