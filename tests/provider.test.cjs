const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { normalizeProvider, createProviderStore, fingerprint } = require('../electron/provider.cjs');
const { configurationArgs } = require('../electron/codex-rpc.cjs');

test('endpoint validation rejects embedded credentials and insecure remote origins', () => {
  const model = 'test-model';
  assert.equal(normalizeProvider({ baseUrl: 'http://127.0.0.1:9999/v1/', model }).baseUrl, 'http://127.0.0.1:9999/v1');
  for (const host of ['10.20.3.3', '172.16.0.1', '172.31.255.255', '192.168.1.2']) assert.ok(normalizeProvider({ baseUrl: `http://${host}:8080/v1`, model }));
  for (const host of ['172.15.0.1', '172.32.0.1', '192.169.1.2', '10.example.com']) assert.throws(() => normalizeProvider({ baseUrl: `http://${host}/v1`, model }));
  for (const baseUrl of ['http://remote.example/v1', 'https://user:key@remote.example/v1', 'https://remote.example/v1?key=x', 'file:///tmp/model', 'https://remote.example/v1/responses']) {
    assert.throws(() => normalizeProvider({ baseUrl, model }));
  }
  assert.notEqual(fingerprint({ baseUrl: 'https://a', model }), fingerprint({ baseUrl: 'https://b', model }));
});

test('key is encrypted, never returned or passed in CLI arguments, and not reused across endpoints', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'atelier-provider-'));
  const crypto = require('node:crypto'); const key = crypto.randomBytes(32); const iv = crypto.randomBytes(16);
  const encryption = { isEncryptionAvailable: () => true,
    encryptString: text => { const cipher = crypto.createCipheriv('aes-256-cbc', key, iv); return Buffer.concat([cipher.update(text), cipher.final()]); },
    decryptString: bytes => { const cipher = crypto.createDecipheriv('aes-256-cbc', key, iv); return Buffer.concat([cipher.update(bytes), cipher.final()]).toString(); } };
  try {
    const store = createProviderStore(directory, encryption);
    const config = { baseUrl: 'https://a.example/v1', model: 'test', apiKey: 'fixture-secret-not-real' };
    await store.save(config);
    assert.equal((await store.public()).hasKey, true);
    assert.equal(JSON.stringify(await store.public()).includes(config.apiKey), false);
    assert.equal((await fs.readFile(path.join(directory, 'provider.json'), 'utf8')).includes(config.apiKey), false);
    assert.equal((await store.secret()).apiKey, config.apiKey);
    assert.equal(configurationArgs(config).join(' ').includes(config.apiKey), false);
    await assert.rejects(store.save({ baseUrl: 'https://b.example/v1', model: 'test' }), /端点已更换/);
    assert.equal((await store.public()).baseUrl, config.baseUrl);
    await store.save({ ...config, baseUrl: 'https://b.example/v1', apiKey: undefined, clearKey: true });
    assert.equal((await store.public()).hasKey, false);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

test('multiple services migrate legacy ciphertext and isolate defaults, keys and models',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'atelier-multi-provider-'));
 const encryption={isEncryptionAvailable:()=>true,encryptString:s=>Buffer.from('encrypted:'+s),decryptString:b=>b.toString().slice(10)};
 try{
  const cipher=encryption.encryptString('legacy-test-key').toString('base64');
  await fs.writeFile(path.join(directory,'provider.json'),JSON.stringify({baseUrl:'https://old.example/v1',model:'old',encryptedKey:cipher}));
  const store=createProviderStore(directory,encryption);const original=await store.list();assert.equal(original.defaultId,'legacy');
  const added=await store.save({create:true,name:'Second',baseUrl:'https://new.example/v1',model:'a',models:['a','b'],apiKey:'second-test-key'});
  const disk=JSON.parse(await fs.readFile(path.join(directory,'provider.json')));assert.equal(disk.providers[0].encryptedKey,cipher);
  assert.equal((await store.secret('legacy')).apiKey,'legacy-test-key');assert.equal((await store.secret(added.id,'b')).apiKey,'second-test-key');
  await store.setDefault(added.id);assert.equal((await store.secret()).id,added.id);assert.equal((await store.secret('legacy')).model,'old');
  assert.ok(!JSON.stringify(await store.list()).includes('encryptedKey'));assert.ok(!JSON.stringify(await store.list()).includes('test-key'));
  await assert.rejects(store.secret(added.id,'missing'));
  await Promise.all([store.save({create:true,name:'Third',baseUrl:'https://third.example/v1',model:'c'}),store.save({create:true,name:'Fourth',baseUrl:'https://fourth.example/v1',model:'d'})]);
  assert.equal((await store.list()).providers.length,4);
  await store.remove(added.id);assert.equal((await store.public()).id,'legacy');
 }finally{await fs.rm(directory,{recursive:true,force:true});}
});
