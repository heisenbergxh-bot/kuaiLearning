param(
    [string]$RepositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot "../..")),
    [string]$OutputDirectory = (Join-Path (Resolve-Path (Join-Path $PSScriptRoot "../..")) "artifacts"),
    [string]$ReleaseId = ""
)

$ErrorActionPreference = "Stop"
$appDirectory = Join-Path $RepositoryRoot "kuaiLearning-app"
if (-not (Test-Path -LiteralPath (Join-Path $appDirectory "package-lock.json") -PathType Leaf)) {
    throw "kuaiLearning-app/package-lock.json not found under $RepositoryRoot"
}
if (-not $ReleaseId) {
    $ReleaseId = (git -C $RepositoryRoot rev-parse --short=12 HEAD).Trim()
}
if ($ReleaseId -notmatch '^[A-Za-z0-9._-]+$') {
    throw "ReleaseId contains unsafe characters: $ReleaseId"
}

New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
$artifact = Join-Path $OutputDirectory "kuailearning-front-$ReleaseId.tar.gz"
if (Test-Path -LiteralPath $artifact) {
    throw "Artifact already exists: $artifact"
}

Push-Location $appDirectory
try {
    npm ci
    npm run lint
    npm test
    npm run build
    if (-not (Test-Path -LiteralPath "dist/index.html" -PathType Leaf)) {
        throw "Frontend build did not produce dist/index.html"
    }
    tar -czf $artifact -C dist .
} finally {
    Pop-Location
}

$hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $artifact).Hash.ToLowerInvariant()
Write-Host "Created: $artifact"
Write-Host "SHA256: $hash"
