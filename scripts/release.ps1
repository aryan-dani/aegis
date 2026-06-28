<#
.SYNOPSIS
  Build, sign, and publish a new Aegis release to GitHub Releases.

.DESCRIPTION
  One-command pipeline for the in-app updater. It:
    1. Bumps the version in package.json, Cargo.toml, and tauri.conf.json
    2. Points the updater endpoint at your GitHub repo
    3. Builds a signed release (SQLCipher env + Tauri signing key)
    4. Generates latest.json (the update manifest the app reads)
    5. Commits, tags, pushes, and creates the GitHub Release with all assets

.PARAMETER Version
  Semver for this release, e.g. 0.2.0

.PARAMETER Notes
  Optional release notes shown in-app and on GitHub.

.PARAMETER Repo
  Optional GitHub repo as "owner/name" (or just "name" to create under your account).
  If omitted, the existing "origin" remote is used, or a private repo named "aegis" is created.

.EXAMPLE
  pwsh scripts/release.ps1 -Version 0.2.0 -Notes "Adds tag filters and faster search"
#>

param(
  [Parameter(Mandatory = $true)]
  [string]$Version,
  [string]$Notes = "",
  [string]$Repo = ""
)

$ErrorActionPreference = "Stop"

function Step($message) {
  Write-Host "==> $message" -ForegroundColor Cyan
}

if ($Version -notmatch '^\d+\.\d+\.\d+$') {
  throw "Version must be semver like 0.2.0 (got '$Version')."
}

$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

# --- Tooling sanity checks -------------------------------------------------
Step "Checking tooling"
if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
  throw "GitHub CLI 'gh' is not on PATH. Open a new terminal or install via 'winget install GitHub.cli'."
}
gh auth status 1>$null 2>$null
if ($LASTEXITCODE -ne 0) {
  throw "You are not logged in to GitHub. Run 'gh auth login' once, then re-run this script."
}

$keyDir = Join-Path $env:USERPROFILE ".aegis"
$keyPath = Join-Path $keyDir "aegis-updater.key"
$envPath = Join-Path $keyDir "release.env"
if (-not (Test-Path $keyPath)) {
  throw "Signing key not found at $keyPath. (It is created once during setup.)"
}

# --- Signing + SQLCipher build environment --------------------------------
Step "Configuring build environment"
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
$env:VCPKG_ROOT = "$env:USERPROFILE\vcpkg"
$env:OPENSSL_NO_VENDOR = "1"
$env:OPENSSL_DIR = "$env:USERPROFILE\vcpkg\installed\x64-windows-static"
$env:OPENSSL_STATIC = "1"
$env:RUSTFLAGS = "-Ctarget-feature=+crt-static"

$env:TAURI_SIGNING_PRIVATE_KEY = (Get-Content $keyPath -Raw).Trim()
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ""
if (Test-Path $envPath) {
  foreach ($line in Get-Content $envPath) {
    if ($line -match '^\s*TAURI_SIGNING_PRIVATE_KEY_PASSWORD\s*=\s*(.*)$') {
      $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = $Matches[1].Trim()
    }
  }
}

# --- Ensure git repo + GitHub remote --------------------------------------
Step "Ensuring git repository"
if (-not (Test-Path (Join-Path $root ".git"))) {
  git init | Out-Null
  git branch -M main
}
# Make sure there is at least one commit so the remote can be pushed.
$previousErrorActionPreference = $ErrorActionPreference
$ErrorActionPreference = "Continue"
git rev-parse --verify HEAD 1>$null 2>$null
$hasHeadCommit = ($LASTEXITCODE -eq 0)
$ErrorActionPreference = $previousErrorActionPreference
if (-not $hasHeadCommit) {
  git add -A
  git commit -m "chore: initial Aegis commit" | Out-Null
}

$hasOrigin = (git remote) -contains "origin"
if (-not $hasOrigin) {
  Step "Creating GitHub repository"
  if (-not $Repo) { $Repo = "aegis" }
  gh repo create $Repo --private --source . --remote origin --push
}

$slug = (gh repo view --json nameWithOwner -q .nameWithOwner)
if (-not $slug) { throw "Could not determine GitHub repo (owner/name)." }
Write-Host "    Publishing to $slug" -ForegroundColor DarkGray

# --- Patch versions + updater endpoint ------------------------------------
Step "Setting version to $Version"
$pkgPath = Join-Path $root "package.json"
$cargoPath = Join-Path $root "src-tauri\Cargo.toml"
$confPath = Join-Path $root "src-tauri\tauri.conf.json"

(Get-Content $pkgPath -Raw) -replace '("version"\s*:\s*")[^"]+(")', "`${1}$Version`${2}" |
  Set-Content $pkgPath -NoNewline
(Get-Content $confPath -Raw) -replace '("version"\s*:\s*")[^"]+(")', "`${1}$Version`${2}" |
  Set-Content $confPath -NoNewline
(Get-Content $cargoPath -Raw) -replace '(?m)^version = "[^"]+"', "version = `"$Version`"" |
  Set-Content $cargoPath -NoNewline

$endpoint = "https://github.com/$slug/releases/latest/download/latest.json"
(Get-Content $confPath -Raw) -replace 'https://github\.com/[^/]+/[^/]+/releases/latest/download/latest\.json', $endpoint |
  Set-Content $confPath -NoNewline

# --- Build signed release --------------------------------------------------
Step "Building signed release (this compiles Rust + SQLCipher)"
pnpm tauri build
if ($LASTEXITCODE -ne 0) { throw "tauri build failed." }

$nsisDir = Join-Path $root "src-tauri\target\release\bundle\nsis"
$setup = Join-Path $nsisDir "Aegis_${Version}_x64-setup.exe"
$sig = "$setup.sig"
if (-not (Test-Path $setup)) { throw "Installer not found: $setup" }
if (-not (Test-Path $sig)) { throw "Signature not found: $sig (is createUpdaterArtifacts enabled?)" }

# --- Generate latest.json (the update manifest) ---------------------------
Step "Generating latest.json"
$signature = (Get-Content $sig -Raw).Trim()
$downloadUrl = "https://github.com/$slug/releases/download/v$Version/Aegis_${Version}_x64-setup.exe"
$manifest = [ordered]@{
  version  = $Version
  notes    = if ($Notes) { $Notes } else { "Aegis v$Version" }
  pub_date = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
  platforms = [ordered]@{
    "windows-x86_64" = [ordered]@{
      signature = $signature
      url       = $downloadUrl
    }
  }
}
$latestPath = Join-Path $root "src-tauri\target\release\latest.json"
$manifest | ConvertTo-Json -Depth 10 | Set-Content $latestPath -Encoding utf8

# --- Commit, tag, push -----------------------------------------------------
Step "Committing and tagging v$Version"
git add -A
git commit -m "release: v$Version" | Out-Null
git tag -f "v$Version" | Out-Null
git push origin main
git push -f origin "v$Version"

# --- Publish GitHub release ------------------------------------------------
Step "Creating GitHub release v$Version"
$releaseNotes = if ($Notes) { $Notes } else { "Aegis v$Version" }
$msi = Join-Path $root "src-tauri\target\release\bundle\msi\Aegis_${Version}_x64_en-US.msi"
$assets = @($setup, $sig, $latestPath)
if (Test-Path $msi) { $assets += $msi }

gh release create "v$Version" $assets --repo $slug --title "v$Version" --notes $releaseNotes
if ($LASTEXITCODE -ne 0) { throw "gh release create failed." }

Step "Done"
Write-Host "Released v$Version to https://github.com/$slug/releases/tag/v$Version" -ForegroundColor Green
Write-Host "Users on an older version can now use Settings -> Check for updates." -ForegroundColor Green
