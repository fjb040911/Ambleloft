const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),{spawnSync}=require('node:child_process');
test('Windows sampler excludes older children and reused roots while preserving actual descendants',{skip:process.platform!=='win32'},()=>{
 const helper=path.resolve(__dirname,'../scripts/probes/windows-process-tree.ps1').replaceAll("'","''");
 const command=`. '${helper}';$time=[DateTime]'2026-11-19T08:00:00';$rows=@();foreach($v in @(@(100,1,0),@(101,100,-3600),@(102,100,1),@(103,102,2),@(104,101,3),@(200,1,60),@(201,200,61),@(300,1,-600))){$rows+=[pscustomobject]@{ProcessId=$v[0];ParentProcessId=$v[1];CreationDate=$time.AddSeconds($v[2])}};$roots=@(@{id=100;recordedAt=$time.AddSeconds(1)},@{id=200;recordedAt=$time},@{id=300;recordedAt=$time});$selected=Get-ProbeProcessTree $rows $roots;@($selected.Keys|Sort-Object)|ConvertTo-Json -Compress`;
 const result=spawnSync('powershell',['-NoProfile','-Command',command],{encoding:'utf8',windowsHide:true,timeout:20000});assert.equal(result.status,0,result.stderr);assert.deepEqual(JSON.parse(result.stdout),[100,102,103]);
});
