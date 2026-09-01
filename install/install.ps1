# Agent Sean installer (Windows). Same flag surface as install.sh.
# Does NOT use npm lifecycle scripts — npm v12 disables them by default.
[CmdletBinding()]
param(
  [switch]$NoOnboard,
  [string]$Version = "",
  [string]$Prefix = "$env:USERPROFILE\.sean",
  [ValidateSet("stable", "extended-stable", "dev")]
  [string]$Channel = "stable",
  [string]$FromSource = "",
  [switch]$DryRun,
  [switch]$Help
)

$ErrorActionPreference = "Stop"
$NodeVersion = "22.19.0"

function Show-Usage {
  @"
Agent Sean installer

  -NoOnboard            skip sean onboard
  -Version X            pin a version
  -Prefix DIR           install prefix (default ~/.sean)
  -Channel NAME         stable | extended-stable | dev
  -FromSource DIR       link the CLI from a git checkout
  -DryRun               print the plan and exit
"@
}

if ($Help) { Show-Usage; exit 0 }

function Write-Log($msg) { Write-Host "==> $msg" }

$needNode = $true
if (Get-Command node -ErrorAction SilentlyContinue) {
  $ok = node -e "const [a,b]=process.versions.node.split('.').map(Number); process.exit(a>22||(a===22&&b>=19)?0:1)"
  if ($LASTEXITCODE -eq 0) { $needNode = $false }
}

Write-Log "prefix=$Prefix channel=$Channel onboard=$(-not $NoOnboard) dry-run=$DryRun"

if ($DryRun) {
  if ($needNode) { Write-Log "would download Node $NodeVersion into $Prefix\runtime" }
  else { Write-Log "would use Node $(node -v) on PATH" }
  if ($FromSource) { Write-Log "would link CLI from source $FromSource (no npm lifecycle scripts)" }
  else { Write-Log "would npm install -g agentsean --prefix $Prefix (no postinstall)" }
  Write-Log "would provision $Prefix on first run, not at install"
  if ($NoOnboard) { Write-Log "would skip onboard" } else { Write-Log "would run sean onboard" }
  exit 0
}

New-Item -ItemType Directory -Force -Path "$Prefix\bin" | Out-Null
$nodeBin = "node"

if ($needNode) {
  Write-Log "Node >= 22.19 not on PATH — downloading official $NodeVersion"
  $arch = if ([Environment]::Is64BitOperatingSystem) { "x64" } else { "x86" }
  $zip = "node-v$NodeVersion-win-$arch.zip"
  $url = "https://nodejs.org/dist/v$NodeVersion/$zip"
  $tmp = Join-Path $env:TEMP "sean-node.zip"
  Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $tmp
  $runtime = Join-Path $Prefix "runtime"
  Expand-Archive -Path $tmp -DestinationPath $runtime -Force
  $inner = Get-ChildItem $runtime -Directory | Select-Object -First 1
  $nodeBin = Join-Path $inner.FullName "node.exe"
  $env:PATH = "$(Join-Path $inner.FullName '');$env:PATH"
}

if ($FromSource) {
  $cli = Join-Path $FromSource "packages\cli\dist\bin.js"
  if (-not (Test-Path $cli)) { throw "build the repo first: pnpm build (looked for $cli)" }
  $shim = Join-Path $Prefix "bin\sean.cmd"
  "@echo off`r`n`"$nodeBin`" `"$cli`" %*" | Set-Content -Path $shim -Encoding ASCII
  Copy-Item $shim (Join-Path $Prefix "bin\agentsean.cmd") -Force
} else {
  $tag = if ($Version) { $Version } elseif ($Channel -eq "dev") { "beta" } elseif ($Channel -eq "extended-stable") { "extended-stable" } else { "latest" }
  npm install -g "agentsean@$tag" --prefix $Prefix
}

$env:PATH = "$(Join-Path $Prefix 'bin');$env:PATH"
$env:SEAN_HOME = if ($env:SEAN_HOME) { $env:SEAN_HOME } else { $Prefix }
Write-Log "provisioning on first run (not as a postinstall)"
if (-not $NoOnboard) {
  & (Join-Path $Prefix "bin\sean.cmd") onboard
  exit $LASTEXITCODE
}
Write-Log "done. Run: $Prefix\bin\sean doctor"
