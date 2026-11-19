const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process'),{createHash}=require('node:crypto');
function prepare(root=path.resolve(__dirname,'..')){
 if(process.platform!=='win32')return;
 const source=path.join(root,'electron/windows-process-host.cs'),file=path.join(root,'build/windows-process-host.exe'),manifest=file+'.json',hash=data=>createHash('sha256').update(data).digest('hex'),sourceHash=hash(fs.readFileSync(source));
 if(fs.existsSync(file)&&fs.existsSync(manifest)){const old=JSON.parse(fs.readFileSync(manifest));if(old.sourceHash===sourceHash&&old.binaryHash===hash(fs.readFileSync(file)))return;}
 const compiler=path.join(process.env.SystemRoot||'C:\\Windows','Microsoft.NET/Framework64/v4.0.30319/csc.exe');
 execFileSync(compiler,['/nologo','/optimize+','/target:exe','/platform:x64','/out:'+file,source],{windowsHide:true,stdio:'pipe'});
 fs.writeFileSync(manifest,JSON.stringify({sourceHash,binaryHash:hash(fs.readFileSync(file))},null,2));
}
module.exports=prepare;if(require.main===module)prepare();
