param([Parameter(Mandatory=$true)][string]$Output,[int]$Seconds=170,[string]$DoneFile='')
$root=[IO.Path]::GetFullPath($Output)
$until=(Get-Date).AddSeconds($Seconds)
while((Get-Date) -lt $until -and (-not $DoneFile -or -not (Test-Path -LiteralPath $DoneFile))){
 $file=Join-Path $root 'samples.jsonl'
 if(Test-Path -LiteralPath $file){
  $row=Get-Content -LiteralPath $file -Tail 1 | ConvertFrom-Json
  $ids=@($row.processes|ForEach-Object {[int]$_.pid})
  $queryStarted=[DateTimeOffset]::UtcNow
  $queryTimer=[Diagnostics.Stopwatch]::StartNew()
  try {$values=@(Get-CimInstance -ClassName Win32_PerfFormattedData_GPUPerformanceCounters_GPUEngine -ErrorAction Stop | Where-Object {$_.Name -match '^pid_(\d+)_' -and $ids -contains [int]$Matches[1]} | Select-Object Name,UtilizationPercentage)
   $sampleTime=if($row.at -is [datetime]){([DateTimeOffset]$row.at).ToUnixTimeMilliseconds()}elseif($row.at -is [string]){[DateTimeOffset]::Parse($row.at).ToUnixTimeMilliseconds()}else{[long]$row.at}
   @{at=(Get-Date).ToUniversalTime().ToString('o');queryStartedAt=$queryStarted.ToString('o');queryMs=$queryTimer.Elapsed.TotalMilliseconds;phase=$row.phase;sampleAgeMs=([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()-$sampleTime);engines=$values}|ConvertTo-Json -Depth 4 -Compress | Add-Content -LiteralPath (Join-Path $root 'gpu-engine-samples.jsonl')
  }catch{@{at=(Get-Date).ToUniversalTime().ToString('o');error=$_.Exception.GetType().Name}|ConvertTo-Json -Compress|Add-Content -LiteralPath (Join-Path $root 'gpu-counter-errors.jsonl')}
 }
 Start-Sleep -Seconds 3
}
