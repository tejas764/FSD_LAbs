param(
    [Parameter(Mandatory=$false)]
    [string]$RegNo = "STUDENT_REGNO"
)

$ProgressPreference = 'SilentlyContinue'
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$sourceDir = Join-Path $scriptDir "lab2"
$zipName = "${RegNo}_Lab2_DisasterRelief.zip"
$zipPath = Join-Path $scriptDir $zipName

Write-Host "Creating submission archive: $zipName..." -ForegroundColor Cyan

# Remove existing zip if present
if (Test-Path $zipPath) {
    Remove-Item $zipPath -Force
}

Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::CreateFromDirectory($sourceDir, $zipPath, [System.IO.Compression.CompressionLevel]::Optimal, $false)

if (Test-Path $zipPath) {
    $zipItem = Get-Item $zipPath
    $zipSizeMB = [Math]::Round($zipItem.Length / 1MB, 2)
    $zipSizeKB = [Math]::Round($zipItem.Length / 1KB, 2)

    Write-Host "Archive created successfully at: $zipPath" -ForegroundColor Green
    Write-Host "Total Archive Size: $zipSizeKB KB ($zipSizeMB MB) [Limit: 25 MB]" -ForegroundColor Yellow
    Write-Host "`nIncluded Files:"
    (Get-ChildItem -Path $sourceDir -Recurse -File) | ForEach-Object {
        Write-Host "  - $($_.FullName.Substring($sourceDir.Length + 1)) ($([Math]::Round($_.Length / 1KB, 1)) KB)"
    }
} else {
    Write-Host "Failed to create archive." -ForegroundColor Red
}
