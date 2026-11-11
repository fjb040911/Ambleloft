const fs = require('node:fs');
const path = require('node:path');
const {format} = require('node:util');

// Only enabled in the isolated update-test build. No request headers or credentials.
function attachUpdateDiagnostics(updater, directory, version) {
  fs.mkdirSync(directory, {recursive: true});
  const file = path.join(directory, 'updater.jsonl');
  if (fs.existsSync(file) && fs.statSync(file).size > 10 * 1024 * 1024) fs.renameSync(file, file + '.previous');
  const write = (event, details) => {
    try { fs.appendFileSync(file, JSON.stringify({at: new Date().toISOString(), version, event, ...details}) + '\n'); }
    catch { /* Diagnostics must not prevent an update. */ }
  };
  updater.logger = Object.fromEntries(['info', 'warn', 'error', 'debug'].map(level => [level, (...args) => write('log', {level, message: format(...args)})]));
  for (const event of ['checking-for-update', 'update-available', 'update-not-available', 'update-downloaded', 'update-cancelled']) {
    updater.on(event, info => write(event, {target: info?.version}));
  }
  updater.on('download-progress', p => write('download-progress', {
    transferred: p.transferred, total: p.total, percent: p.percent, bytesPerSecond: p.bytesPerSecond,
  }));
  updater.on('error', error => write('error', {message: error.message}));
  write('startup', {directory});
  return write;
}
module.exports = {attachUpdateDiagnostics};
