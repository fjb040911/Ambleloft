param([Parameter(Mandatory=$true)][string]$FixtureDirectory)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[Console]::InputEncoding=New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding=New-Object System.Text.UTF8Encoding($false)
# Materialize the clipboard in memory before changing it. Never log its contents.
$original=[System.Windows.Forms.Clipboard]::GetDataObject()
$backup=New-Object System.Windows.Forms.DataObject
if($original){foreach($format in $original.GetFormats($false)){
 $data=$original.GetData($format,$false)
 if($data -is [System.Drawing.Image]){$data=$data.Clone()}
 elseif($data -is [System.IO.MemoryStream]){$data=New-Object System.IO.MemoryStream(,$data.ToArray())}
 if($null -ne $data){$backup.SetData($format,$false,$data)}
}}
[Console]::WriteLine('{"ready":true}')
try{
 while($null -ne ($line=[Console]::ReadLine())){
  $request=$line | ConvertFrom-Json
  try{
   if($request.action -eq 'restore'){break}
   if($request.action -eq 'image'){
    $bitmap=[System.Drawing.Image]::FromFile((Join-Path $FixtureDirectory 'paste-image.png'))
    try{[System.Windows.Forms.Clipboard]::SetImage($bitmap)}finally{$bitmap.Dispose()}
   }elseif($request.action -eq 'files'){
    $files=New-Object System.Collections.Specialized.StringCollection
    [void]$files.Add((Join-Path $FixtureDirectory 'paste-image.png'))
    [void]$files.Add((Join-Path $FixtureDirectory 'paste-file.txt'))
    [System.Windows.Forms.Clipboard]::SetFileDropList($files)
   }else{throw 'Unknown fixture action'}
   [Console]::WriteLine('{"ok":true}')
  }catch{[Console]::WriteLine('{"ok":false,"error":"Clipboard fixture operation failed"}')}
 }
}finally{
 [System.Windows.Forms.Clipboard]::SetDataObject($backup,$true,10,100)
 [Console]::WriteLine('{"restored":true}')
}
