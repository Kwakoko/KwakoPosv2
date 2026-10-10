$ErrorActionPreference = "Stop"
$dbName = "kwakopos2_dashboard_regression_20261010a1"
$line = Get-Content ".env" | Where-Object { $_ -match "^DATABASE_URL=" } | Select-Object -First 1
if (-not $line) { throw "DATABASE_URL was not found in .env" }
$rawUrl = $line.Substring("DATABASE_URL=".Length).Trim().Trim('"').Trim("'")
$adminUrl = $rawUrl -replace "/kwakopos2(?=[?]|$)", "/postgres"
$testUrl = $rawUrl -replace "/kwakopos2(?=[?]|$)", "/$dbName"
$created = $false
$testExit = 1
try {
  $env:DATABASE_URL = $adminUrl
  Write-Output "CREATE DATABASE $dbName;" | npx prisma db execute --schema packages/database/prisma/schema.prisma --stdin
  if ($LASTEXITCODE -ne 0) { throw "Could not create disposable regression database." }
  $created = $true

  $env:DATABASE_URL = $testUrl
  npx prisma db push --schema packages/database/prisma/schema.prisma --force-reset --accept-data-loss --skip-generate
  if ($LASTEXITCODE -ne 0) { throw "Could not sync disposable regression database to the Prisma schema." }

  # db push creates the Prisma model tables, but this raw migration owns the
  # synchronization journal used by atomic finance writes.
  npx prisma db execute --schema packages/database/prisma/schema.prisma --file packages/database/prisma/migrations/202609150001_world_standard_offline_sync/migration.sql
  if ($LASTEXITCODE -ne 0) { throw "Could not apply the sync journal foundation to the disposable database." }
  npx prisma db execute --schema packages/database/prisma/schema.prisma --file packages/database/prisma/migrations/202609230001_convergence_hardening/migration.sql
  if ($LASTEXITCODE -ne 0) { throw "Could not apply scoped sync idempotency constraints to the disposable database." }

  npx vitest run tests/integration/dashboard-financial-closures.test.ts
  $testExit = $LASTEXITCODE
  Write-Output "DASHBOARD_FINANCIAL_CLOSURES_EXIT=$testExit"
} catch {
  Write-Error $_
  $testExit = 1
} finally {
  if ($created) {
    $env:DATABASE_URL = $adminUrl
    Write-Output "DROP DATABASE $dbName WITH (FORCE);" | npx prisma db execute --schema packages/database/prisma/schema.prisma --stdin
    if ($LASTEXITCODE -ne 0) { Write-Warning "Could not automatically drop disposable database $dbName; it contains test-only data." }
  }
}
exit $testExit
