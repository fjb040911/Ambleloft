param(
    [Parameter(Mandatory=$true)][string]$Installer,
    [string]$InstallDirectory = "$env:LOCALAPPDATA\Programs\Ambleloft",
    [switch]$Launch
)
$ErrorActionPreference = 'Stop'
$expectedInstallerHash = 'E9A97BD76DF1763256625F2E7AF6B4E46EBC561BAFA82C9C5C6B9A2E585A518E'
$expectedBlockmapHash = 'E3794D663A1768D33943AE121020814CFC51967DEBAD063600B1E4861F711881'
$installRoot = (Resolve-Path -LiteralPath $InstallDirectory).Path
$exe = Join-Path $installRoot 'Ambleloft.exe'
$config = Join-Path $installRoot 'resources\app-update.yml'
if (!(Test-Path -LiteralPath $config) -or (Get-Item -LiteralPath $exe).VersionInfo.FileVersion -ne '0.9.4') {
    throw 'Select the installed Ambleloft 0.9.4 directory, not Update Test or a different version.'
}
foreach ($process in @(Get-Process -Name Ambleloft -ErrorAction SilentlyContinue)) {
    if (!$process.Path -or $process.Path -eq $exe) { throw 'Quit Ambleloft completely before configuring its update channel.' }
}
if ((Get-FileHash -LiteralPath $Installer -Algorithm SHA256).Hash -ne $expectedInstallerHash) {
    throw 'Installer SHA-256 mismatch. Use the original v0.9.4 Windows x64 installer from GitHub.'
}
$original = Get-Content -LiteralPath $config -Raw
if ($original -match 'publisherName:' -or $original -notmatch '(?m)^updaterCacheDirName: ambleloft-updater\s*$') {
    throw 'Unexpected updater configuration; nothing was changed.'
}
# Download and verify the small old blockmap before changing any configuration.
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$temporaryBlockmap = Join-Path ([IO.Path]::GetTempPath()) ('amble-preview-' + [guid]::NewGuid() + '.blockmap')
try {
    Invoke-WebRequest -UseBasicParsing -Uri 'https://github.com/fjb040911/Ambleloft/releases/download/v0.9.4/Ambleloft-0.9.4-windows-x64.exe.blockmap' -OutFile $temporaryBlockmap
    if ((Get-FileHash -LiteralPath $temporaryBlockmap -Algorithm SHA256).Hash -ne $expectedBlockmapHash) { throw 'Old blockmap SHA-256 mismatch.' }
    $cache = Join-Path $env:LOCALAPPDATA 'ambleloft-updater'
    New-Item -ItemType Directory -Path $cache -Force | Out-Null
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
    Copy-Item -LiteralPath $config -Destination ($config + '.before-preview-' + $stamp)
    foreach ($name in @('installer.exe','current.blockmap')) {
        $cached = Join-Path $cache $name
        if (Test-Path -LiteralPath $cached) { Copy-Item -LiteralPath $cached -Destination ($cached + '.before-preview-' + $stamp) }
    }
    Copy-Item -LiteralPath $Installer -Destination (Join-Path $cache 'installer.exe') -Force
    Copy-Item -LiteralPath $temporaryBlockmap -Destination (Join-Path $cache 'current.blockmap') -Force
    # A generic feed explicitly opts this test machine into the preview release.
    # The existing 0.9.4 client ignores GitHub prereleases; no binary is modified.
    $preview = @'
provider: generic
url: https://github.com/fjb040911/Ambleloft/releases/download/v0.9.5/
channel: preview
useMultipleRangeRequest: false
updaterCacheDirName: ambleloft-updater
'@
    [IO.File]::WriteAllText($config, $preview + "`n", (New-Object Text.UTF8Encoding($false)))
    Write-Host 'Preview feed enabled for 0.9.4 -> 0.9.5. Old installer and blockmap cache verified.'
    Write-Host 'Open Settings > Version and updates > Check updates, then click the blue download button.'
    Write-Host 'After downloading, choose Restart and update. This one-time feed is replaced by the 0.9.5 installer.'
    if ($Launch) {
        $logDir = Join-Path $cache ('preview-validation-' + $stamp)
        New-Item -ItemType Directory -Path $logDir | Out-Null
        Start-Process -FilePath $exe -RedirectStandardOutput (Join-Path $logDir 'stdout.log') -RedirectStandardError (Join-Path $logDir 'stderr.log')
        Write-Host "Updater logs: $logDir"
    }
} finally {
    if (Test-Path -LiteralPath $temporaryBlockmap) { Remove-Item -LiteralPath $temporaryBlockmap }
}
