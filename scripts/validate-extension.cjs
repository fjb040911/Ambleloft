const path = require('node:path');
const { validatePackage } = require('../core/extensions/manifest.cjs');
if (process.argv.length !== 3) { console.error('Usage: npm run extensions:validate -- <package-directory>'); process.exitCode = 2; }
else {
  const { ok, errors, extensionId, contractRevision } = validatePackage(path.resolve(process.argv[2]));
  console.log(JSON.stringify({ ok, errors, extensionId, contractRevision }, null, 2)); process.exitCode = ok ? 0 : 1;
}
