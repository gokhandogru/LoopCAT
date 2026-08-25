param(
  [Parameter(Mandatory = $true)]
  [string]$DistDirectory,

  [Parameter(Mandatory = $true)]
  [string]$Version
)

$ErrorActionPreference = "Stop"

$distPath = [System.IO.Path]::GetFullPath($DistDirectory).TrimEnd([System.IO.Path]::DirectorySeparatorChar)
$installerPath = [System.IO.Path]::Combine($distPath, "LoopCAT Setup $Version.exe")
$portablePath = [System.IO.Path]::Combine($distPath, "LoopCAT $Version.exe")
$installerZipPath = [System.IO.Path]::Combine($distPath, "LoopCAT Windows Setup $Version.zip")
$portableZipPath = [System.IO.Path]::Combine($distPath, "LoopCAT $Version Portable.zip")
$installerTempZipPath = [System.IO.Path]::Combine($distPath, "LoopCAT Windows Setup $Version.tmp.zip")
$portableTempZipPath = [System.IO.Path]::Combine($distPath, "LoopCAT $Version Portable.tmp.zip")

foreach ($path in @($installerPath, $portablePath, $installerZipPath, $portableZipPath, $installerTempZipPath, $portableTempZipPath)) {
  $resolved = [System.IO.Path]::GetFullPath($path)
  if ([System.IO.Path]::GetDirectoryName($resolved) -ne $distPath) {
    throw "Refusing to read or write a Windows release artifact outside dist: $resolved"
  }
}

foreach ($source in @($installerPath, $portablePath)) {
  if (-not [System.IO.File]::Exists($source)) {
    throw "Missing Windows release executable: $source"
  }
}

Remove-Item -LiteralPath $installerTempZipPath, $portableTempZipPath -Force -ErrorAction SilentlyContinue

try {
  Compress-Archive -LiteralPath $installerPath -DestinationPath $installerTempZipPath -CompressionLevel Optimal
  Compress-Archive -LiteralPath $portablePath -DestinationPath $portableTempZipPath -CompressionLevel Optimal

  Remove-Item -LiteralPath $installerZipPath, $portableZipPath -Force -ErrorAction SilentlyContinue
  Move-Item -LiteralPath $installerTempZipPath -Destination $installerZipPath
  Move-Item -LiteralPath $portableTempZipPath -Destination $portableZipPath
}
catch {
  Remove-Item -LiteralPath $installerTempZipPath, $portableTempZipPath -Force -ErrorAction SilentlyContinue
  throw
}

Write-Output "Created current Windows installer and portable ZIP wrappers in $distPath."
