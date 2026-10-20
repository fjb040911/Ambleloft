const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { randomUUID } = require('node:crypto');

function shellProfiles(platform = process.platform, env = process.env) {
  const find = name => {
    for (const dir of (env.PATH || env.Path || '').split(platform === 'win32' ? ';' : ':')) {
      const file = path.join(dir, name);
      try { fs.accessSync(file, platform === 'win32' ? fs.constants.F_OK : fs.constants.X_OK); if (fs.statSync(file).isFile()) return file; } catch {}
    }
  };
  const candidates = platform === 'win32'
    ? [find('pwsh.exe'), path.join(env.SystemRoot || 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe'), env.ComSpec || path.join(env.SystemRoot || 'C:\\Windows', 'System32/cmd.exe')]
    : [env.SHELL || os.userInfo().shell, '/bin/bash', '/bin/zsh', '/usr/bin/fish', '/bin/sh'];
  return [...new Set(candidates.filter(Boolean))].filter(file => {
    try { fs.accessSync(file, platform === 'win32' ? fs.constants.F_OK : fs.constants.X_OK); return fs.statSync(file).isFile(); } catch { return false; }
  }).map(file => ({ id: file, name: path.basename(file).replace(/\.exe$/i, ''), args: platform === 'win32' ? (/powershell|pwsh/i.test(path.basename(file)) ? ['-NoLogo'] : []) : ['-l'] }));
}
function dimensions(input) {
  if (!Number.isInteger(input.cols) || !Number.isInteger(input.rows) || input.cols < 2 || input.cols > 500 || input.rows < 1 || input.rows > 300) throw Error('Invalid terminal size');
  return { cols: input.cols, rows: input.rows };
}
class TerminalService {
  constructor({ resolveContext, spawnRemote, spawn = (...args) => require('node-pty').spawn(...args), profiles = shellProfiles() }) {
    this.resolveContext = resolveContext; this.spawnRemote=spawnRemote; this.spawn = spawn; this.profiles = profiles; this.sessions = new Map(); this.closedOwners = new Set(); this.closed = false;
  }
  info(s) { return { id: s.id, projectId: s.projectId, runId: s.runId, cwd: s.cwd, shell: s.shell, remote:!!s.connectionId, exited: s.exited, exitCode: s.exitCode }; }
  get(owner, id) { const s = this.sessions.get(id); if (!s || s.owner !== owner.id) throw Error('Terminal not found'); return s; }
  list(owner) { return [...this.sessions.values()].filter(s => s.owner === owner.id).map(s => this.info(s)); }
  async create(owner, input = {}) {
    const context = await this.resolveContext(input);
    if (this.closed || this.closedOwners.has(owner.id)) throw Error('Terminal owner closed');
    if (this.list(owner).length >= 16) throw Error('最多同时保留 16 个终端');
    const profile = input.shell ? this.profiles.find(p => p.id === input.shell) : this.profiles[0];
    if (!profile&&!context.connectionId) throw Error('没有可用的 Shell');
    const size = dimensions({cols: input.cols ?? 80, rows: input.rows ?? 24});
    const env = {...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor'};
    delete env.ELECTRON_RUN_AS_NODE; delete env.NODE_OPTIONS; delete env.NODE_CHANNEL_FD;
    const pty = context.connectionId ? await this.spawnRemote(context,size) : this.spawn(profile.id, profile.args, {name:'xterm-256color', ...size, cwd:context.cwd, env});
    if(this.closed||this.closedOwners.has(owner.id)){pty.kill();throw Error('Terminal owner closed');}
    if(this.list(owner).length>=16){pty.kill();throw Error('最多同时保留 16 个终端');}
    const s = {id:randomUUID(), owner:owner.id, ...context, shell:context.connectionId?'SSH bash':profile.name, pty, output:'', paused:false, exited:false, exitCode:null};
    this.sessions.set(s.id, s);
    s.data = pty.onData(data => {
      s.output += data;
      if (s.output.length >= 262144 && !s.paused) { s.paused = true; pty.pause(); }
      // Bound memory even if a platform delivers data already queued before pause.
      if (s.output.length > 1048576) s.output = '\r\n[输出过多，部分内容已截断]\r\n' + s.output.slice(-524288);
    });
    s.exit = pty.onExit(({exitCode}) => {s.exited = true; s.exitCode = exitCode;});
    return this.info(s);
  }
  read(owner, input) {
    const s = this.get(owner, input?.id);
    const data = s.output; s.output = '';
    if (s.paused && !s.exited) {s.paused = false; s.pty.resume();}
    return {data, exited:s.exited, exitCode:s.exitCode};
  }
  write(owner, input) {
    const s = this.get(owner, input?.id);
    if (typeof input.data !== 'string' || input.data.length > 65536) throw Error('Invalid terminal input');
    if (s.exited) throw Error('终端已退出');
    s.pty.write(input.data);
  }
  resize(owner, input) {const s = this.get(owner, input?.id); const size = dimensions(input); if (!s.exited) s.pty.resize(size.cols, size.rows);}
  close(owner, input) {
    const s = this.get(owner, input?.id);
    try {if (!s.exited) s.pty.kill();} finally {s.data.dispose(); s.exit.dispose(); this.sessions.delete(s.id);}
  }
  closeOwner(owner) {this.closedOwners.add(owner.id); for (const s of this.list(owner)) {try {this.close(owner, s);} catch {}}}
  shutdown() {this.closed = true; for (const s of [...this.sessions.values()]) this.closeOwner({id:s.owner});}
}
module.exports = {TerminalService, shellProfiles, dimensions};
