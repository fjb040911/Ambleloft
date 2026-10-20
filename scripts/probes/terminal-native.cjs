// Run with the target Electron runtime before packaging, including spawn-helper.
const {shellProfiles}=require('../../electron/terminal.cjs');
const profile=shellProfiles()[0];
if(!profile)throw Error('No supported shell found');
const shell=require('node-pty').spawn(profile.id,profile.args,{cols:80,rows:24,cwd:require('node:os').tmpdir(),env:{...process.env,ELECTRON_RUN_AS_NODE:'',TERM:'xterm-256color'}});
let output='';const timeout=setTimeout(()=>{shell.kill();console.error('PTY probe timed out');process.exit(1);},10000);
shell.onData(data=>output+=data);
shell.onExit(({exitCode})=>{clearTimeout(timeout);if(exitCode!==0||!output.includes('AMBLE_PTY_OK'))process.exit(1);console.log('Native PTY passed');});
shell.write('echo AMBLE_PTY_OK\r');shell.write('exit\r');
