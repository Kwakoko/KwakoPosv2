# cleanup-github-actions.ps1
# Deletes COMPLETED GitHub Actions workflow runs older than 30 days.
# Repository: Kwakoko/KwakoPosv2
# Processes deletions serially with retries and a 1-second throttle.

$ErrorActionPreference = "Stop"

$Repo = "Kwakoko/KwakoPosv2"
$RetentionDays = 30
$Cutoff = (Get-Date).ToUniversalTime().AddDays(-$RetentionDays)
$LogFile = Join-Path $PSScriptRoot "github-actions-cleanup.log"

Write-Host ""
Write-Host "==============================================" -ForegroundColor Cyan
Write-Host " GitHub Actions Workflow Run Cleanup" -ForegroundColor Cyan
Write-Host "==============================================" -ForegroundColor Cyan
Write-Host "Repository : $Repo"
Write-Host "Cutoff     : $Cutoff UTC"
Write-Host "Policy     : COMPLETED runs older than $RetentionDays days"
Write-Host ""

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    throw "GitHub CLI (gh) is not installed or not in PATH."
}

gh auth status
if ($LASTEXITCODE -ne 0) {
    throw "GitHub CLI authentication check failed."
}

Write-Host ""
$confirm = Read-Host "Type DELETE to begin deletion"

if ($confirm -ne "DELETE") {
    Write-Host "Cancelled." -ForegroundColor Yellow
    exit 0
}

"Cleanup started: $(Get-Date -Format o)" | Out-File $LogFile -Encoding utf8

Write-Host ""
Write-Host "Discovering old completed workflow runs..." -ForegroundColor Cyan

$createdFilter = "<$($Cutoff.ToString("yyyy-MM-ddTHH:mm:ssZ"))"
$encodedCreatedFilter = [Uri]::EscapeDataString($createdFilter)

$runIds = @(
    gh api --paginate `
        "repos/$Repo/actions/runs?per_page=100&created=$encodedCreatedFilter&status=completed" `
        --jq '.workflow_runs[].id'
)

if ($LASTEXITCODE -ne 0) {
    throw "Failed to enumerate workflow runs."
}

$runIds = @(
    $runIds |
        Where-Object { $_ -match '^\d+$' } |
        Select-Object -Unique
)

$total = $runIds.Count

Write-Host "Runs found for deletion: $total" -ForegroundColor Yellow
Write-Host ""

if ($total -eq 0) {
    Write-Host "Nothing to delete." -ForegroundColor Green
    "Nothing to delete." | Out-File $LogFile -Append -Encoding utf8
    exit 0
}

$deleted = 0
$failed = 0
$failedIds = New-Object System.Collections.Generic.List[string]

foreach ($runId in $runIds) {
    $attempt = 0
    $success = $false

    while (-not $success -and $attempt -lt 6) {
        $attempt++

        try {
            gh api --method DELETE "repos/$Repo/actions/runs/$runId"
            if ($LASTEXITCODE -ne 0) {
                throw "gh api returned exit code $LASTEXITCODE"
            }

            $deleted++
            $success = $true

            $message = "[{0}/{1}] DELETED run {2}" -f $deleted, $total, $runId
            Write-Host $message -ForegroundColor Green
            Add-Content $LogFile $message

            Start-Sleep -Seconds 1
        }
        catch {
            if ($attempt -ge 6) {
                $failed++
                $failedIds.Add($runId)

                $message = "FAILED run $runId after $attempt attempts: $($_.Exception.Message)"
                Write-Host $message -ForegroundColor Red
                Add-Content $LogFile $message
            }
            else {
                $delay = [Math]::Min(60, [Math]::Pow(2, $attempt))

                Write-Host "Run $runId failed; retry $attempt/6 in $delay seconds..." -ForegroundColor Yellow
                Start-Sleep -Seconds $delay
            }
        }
    }
}

Write-Host ""
Write-Host "==============================================" -ForegroundColor Cyan
Write-Host " Cleanup Complete" -ForegroundColor Cyan
Write-Host "==============================================" -ForegroundColor Cyan
Write-Host "Found   : $total"
Write-Host "Deleted : $deleted" -ForegroundColor Green
Write-Host "Failed  : $failed" -ForegroundColor $(if ($failed) { "Red" } else { "Green" })
Write-Host "Log     : $LogFile"
Write-Host ""

if ($failedIds.Count -gt 0) {
    Write-Host "Failed run IDs:" -ForegroundColor Red
    $failedIds | ForEach-Object { Write-Host "  $_" }
}

"Cleanup finished: $(Get-Date -Format o)" | Out-File $LogFile -Append -Encoding utf8
"Found=$total Deleted=$deleted Failed=$failed" | Out-File $LogFile -Append -Encoding utf8
