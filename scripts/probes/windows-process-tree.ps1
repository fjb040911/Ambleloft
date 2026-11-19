function Get-ProbeProcessTree($Processes, $Roots) {
 $byId=@{};foreach($process in $Processes){$byId[[int]$process.ProcessId]=$process}
 $selected=@{}
 foreach($root in $Roots){
  $process=$byId[[int]$root.id];if(-not $process){continue}
  # A reused PID created after the marker cannot be the recorded process.
  if($process.CreationDate -gt $root.recordedAt -or $process.CreationDate -lt $root.recordedAt.AddMinutes(-2)){continue}
  $selected[[int]$process.ProcessId]=$process.CreationDate
 }
 do{$changed=$false;foreach($process in $Processes){
  if($selected.ContainsKey([int]$process.ParentProcessId) -and -not $selected.ContainsKey([int]$process.ProcessId) -and $process.CreationDate -ge $selected[[int]$process.ParentProcessId]){
   $selected[[int]$process.ProcessId]=$process.CreationDate;$changed=$true
  }
 }}while($changed)
 return $selected
}
