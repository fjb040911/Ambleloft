const test = require('node:test');
const assert = require('node:assert/strict');
const { configureSecureStorage, createSecureStorage } = require('../electron/secure-storage.cjs');
const appWith = entries => {
 const switches = new Map(entries);
 return {commandLine:{removeSwitch:key=>switches.delete(key),getSwitchValue:key=>switches.get(key)||'',hasSwitch:key=>switches.has(key)},switches};
};
test('startup removes automation crypto overrides without changing secure backends',()=>{
 const app=appWith([['use-mock-keychain',''],['password-store','basic'],['other','keep']]);
 configureSecureStorage(app);
 assert.deepEqual([...app.switches],[['other','keep']]);
 const secure=appWith([['password-store','gnome-libsecret']]);configureSecureStorage(secure);
 assert.equal(secure.commandLine.getSwitchValue('password-store'),'gnome-libsecret');
});
test('credentials cannot use a mock backend injected after startup',()=>{
 const app=appWith([]);let calls=0;
 const store=createSecureStorage(app,{isEncryptionAvailable:()=>true,encryptString:()=>{calls++},decryptString:()=>{calls++}});
 app.switches.set('use-mock-keychain','');
 assert.throws(()=>store.isEncryptionAvailable());assert.throws(()=>store.encryptString('fixture'));assert.throws(()=>store.decryptString(Buffer.alloc(0)));
 assert.equal(calls,0);
});
