param([Parameter(Mandatory=$true)][string]$Output,[string[]]$RootFiles=@('application/application.pid','component/soak.pid'))
. (Join-Path $PSScriptRoot 'windows-process-tree.ps1')
$outPath=[IO.Path]::GetFullPath($Output)
$known=@{}
while(-not (Test-Path -LiteralPath (Join-Path $outPath 'sampling.done'))){
 $all=@(Get-CimInstance Win32_Process)
 $roots=@();$rootRecords=@()
 foreach($relative in $RootFiles){
  $file=Join-Path $outPath $relative
  if(Test-Path -LiteralPath $file){$value=Get-Content -LiteralPath $file -Raw;if($value.Trim() -match '^\d+$'){$rootRecords+=@{id=[int]$value.Trim();recordedAt=(Get-Item -LiteralPath $file).LastWriteTime}}}
 }
 $selected=Get-ProbeProcessTree $all $rootRecords;foreach($root in $rootRecords){if($selected.ContainsKey([int]$root.id)){$roots+=[int]$root.id}}
 $records=@();foreach($p in $all){$key=[string]$p.ProcessId+':'+$p.CreationDate.ToString('o');if($selected.ContainsKey([int]$p.ProcessId)-or $known.ContainsKey($key)){
  $known[$key]=$true;$process=Get-Process -Id $p.ProcessId -ErrorAction SilentlyContinue
  $records+=[pscustomobject]@{pid=$p.ProcessId;parentPid=$p.ParentProcessId;name=$p.Name;createdAt=$p.CreationDate.ToString('o');workingSet=[long]$p.WorkingSetSize;privateBytes=if($process){$process.PrivateMemorySize64}else{$null};handles=$p.HandleCount;cpu100ns=([double]$p.KernelModeTime+[double]$p.UserModeTime);readBytes=[double]$p.ReadTransferCount;writeBytes=[double]$p.WriteTransferCount;orphan=-not $selected.ContainsKey([int]$p.ProcessId)}
 }}
 $row=@{at=(Get-Date).ToUniversalTime().ToString('o');roots=$roots;processes=$records;workingSetTotal=($records|Measure-Object -Property workingSet -Sum).Sum;privateBytesTotal=($records|Measure-Object -Property privateBytes -Sum).Sum;handlesTotal=($records|Measure-Object -Property handles -Sum).Sum}
 $row | ConvertTo-Json -Depth 6 -Compress | Add-Content -LiteralPath (Join-Path $outPath 'windows-process-samples.jsonl')
 Start-Sleep -Seconds 5
}
