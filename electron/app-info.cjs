const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {execFileSync} = require('node:child_process');

function sourceBuild(root) {
  let commit = null, dirty = null;
  const git = args => execFileSync('git', args, {cwd:root,encoding:'utf8',timeout:1500,stdio:['ignore','pipe','ignore']}).trim();
  try {
    const value = git(['rev-parse','--short=12','HEAD']);
    if (/^[a-f0-9]{7,40}$/.test(value)) commit = value;
    dirty = Boolean(git(['status','--porcelain','--untracked-files=normal']));
  } catch { /* Source archives may not contain Git metadata. */ }
  return {commit,dirty};
}
function appInfo(app) {
  const root = app.getAppPath(), version = app.getVersion();
  let build = {commit:null,dirty:null,builtAt:null};
  if (!app.isPackaged) build = {...build,...sourceBuild(root)};
  else {
    try {
      const value = JSON.parse(fs.readFileSync(path.join(root,'dist','build-info.json'),'utf8'));
      // Never identify an installed app using the current checkout or stale version metadata.
      if (value.version === version) build = {
        commit:/^[a-f0-9]{7,40}$/.test(value.commit || '') ? value.commit : null,
        dirty:typeof value.dirty === 'boolean' ? value.dirty : null,
        builtAt:typeof value.builtAt === 'string' && Number.isFinite(Date.parse(value.builtAt)) ? value.builtAt : null,
      };
    } catch { /* Older packages can still report their real runtime version. */ }
  }
  return {version,channel:app.isPackaged?'packaged':'development',platform:process.platform,osVersion:os.release(),arch:process.arch,...build};
}
module.exports = {appInfo,sourceBuild};
