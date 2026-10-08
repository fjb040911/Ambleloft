// Audit staged source and, optionally, the built ASAR without reading user data.
const {execFileSync}=require('node:child_process');
const assert=require('node:assert/strict');
const forbidden=/(^|\/)(output|outputs|tooling-report|test-results|playwright-report|coverage|\.cache)(\/|$)/;
const files=execFileSync('git',['ls-files','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
assert.deepEqual(files.filter(file=>forbidden.test(file)),[],'Local artifacts must not be tracked');
assert(files.some(file=>file.startsWith('specs/')),'Source specs must remain tracked');
for(const name of ['output','outputs','tooling-report','coverage','.cache']) {
 execFileSync('git',['check-ignore','--no-index',`${name}/audit-placeholder`,`nested/${name}/audit-placeholder`]);
}
if(process.argv[2]) {
 const entries=require('@electron/asar').listPackage(process.argv[2]);
 assert.deepEqual(entries.filter(file=>forbidden.test(file)),[],'Local artifacts must not enter ASAR');
 assert.deepEqual(entries.filter(file=>/^\/(specs|docs|tests|scripts)(\/|$)/.test(file)),[],'Development documents must not enter ASAR');
 console.log('ASAR content verified');
}
console.log(`Source content verified: ${files.length} tracked files, no local artifacts`);
