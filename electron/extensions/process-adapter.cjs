const {EventEmitter}=require('node:events');const path=require('node:path');
const ALLOWED=['LANG','LC_ALL','LC_CTYPE','TZ','HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','NO_PROXY','http_proxy','https_proxy','all_proxy','no_proxy','SSL_CERT_FILE','SSL_CERT_DIR','NODE_EXTRA_CA_CERTS','SystemRoot','WINDIR','TEMP','TMP','TMPDIR'];
function environment(source=process.env){return Object.fromEntries(ALLOWED.filter(key=>typeof source[key]==='string').map(key=>[key,source[key]]));}
function createProcessAdapter(utilityProcess,locale){return {locale,spawn(directory){
 const child=utilityProcess.fork(path.join(__dirname,'../../core/extensions/bootstrap.cjs'),[],{cwd:directory,env:environment(),stdio:'pipe',serviceName:'Ambleloft Extension'});
 const channel=new EventEmitter();channel.send=message=>child.postMessage(message);channel.kill=()=>child.kill();
 child.on('message',message=>channel.emit('message',message));child.once('exit',code=>channel.emit('exit',code));
 child.stdout?.on('data',data=>channel.emit('log',data.toString()));child.stderr?.on('data',data=>channel.emit('log',data.toString()));return channel;
 }};}
module.exports={createProcessAdapter,environment};
