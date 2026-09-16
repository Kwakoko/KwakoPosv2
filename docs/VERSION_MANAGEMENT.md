# Version Management Prevention Guide

## Problem
The KwakoPos monorepo was stuck at version 2.12.5 despite significant commits ahead due to version drift across:
- Root `package.json`
- Workspace packages (`apps/api`, `apps/web`, `packages/*`)
- `FALLBACK_AUTHORITATIVE_RELEASE` hardcoded fallback
- Service Worker cache names
- PWA manifest versions

## Root Causes
1. ❌ **Manual version bumping** - Developers forgot to update all files when versioning
2. ❌ **No pre-commit enforcement** - Version mismatches went undetected at commit time
3. ❌ **No CI/CD gate** - No automated checks before merge/release
4. ❌ **No documentation** - Unclear which files need version updates

## Solution: Automated Version Management Pipeline

### 1. SETUP: Install Git Hooks (ONE TIME)
```bash
# Make pre-commit hook executable
chmod +x scripts/hooks/pre-commit-version-check.sh

# Install into .git/hooks (automated)
cp scripts/hooks/pre-commit-version-check.sh .git/hooks/pre-commit
```

### 2. DAILY: Committing Changes
When you commit changes that should bump the version:
```bash
# Use conventional commits (automatically triggers version sync)
git commit -m "feat(sync): add new feature"  # minor bump
git commit -m "fix(api): resolve bug"        # patch bump
git commit -m "feat!: breaking change"       # major bump
```

The **pre-commit hook** will:
- ✅ Detect if version should change
- ✅ Run version:check automatically
- ✅ Block commits if drift detected
- ✅ Provide fix instructions

### 3. BEFORE RELEASE: Automated Version Sync
```bash
# Single command handles everything
npm run release:prepare

# This runs:
# 1. npm run build
# 2. npm run test:unit
# 3. npm run release:sync-versions (auto-syncs all versions)
```

### 4. CI/CD PIPELINE: Automated Gates

Create `.github/workflows/version-drift-gate.yml`:
```yaml
name: Version Drift Gate

on:
  pull_request:
    paths:
      - 'package.json'
      - 'packages/*/package.json'
      - 'apps/*/package.json'
      - 'packages/config/src/authoritativeRelease.ts'

jobs:
  version-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm run version:check
        name: "Verify no version drift"
```

## Key Automation Tools Already In Place

### ✅ `npm run version:check`
Validates:
- All package.json files have matching versions
- Authoritative release identity is current
- No stale hardcoded version patterns
- Service Worker cache names aligned
- PWA manifests synchronized

### ✅ `npm run version:sync`
Automatically:
- Reads root package.json as single source of truth
- Syncs all workspace packages to that version
- Updates internal `@kwakopos2/*` dependencies
- Syncs package-lock.json
- Updates release-manifest.json if exists

### ✅ `npm run release:prepare`
Pre-release checklist:
- Builds entire project
- Runs unit tests
- Syncs all versions
- Ready for deployment

## Implementation Checklist

### Phase 1: Immediate (Today)
- [x] Update root package.json to 2.13.0
- [x] Update apps/api/package.json to 2.13.0
- [x] Update apps/web/package.json to 2.13.0
- [x] Update FALLBACK_AUTHORITATIVE_RELEASE to 2.13.0
- [x] Run `npm run version:check` - PASS ✅

### Phase 2: Short Term (This Week)
- [ ] Create `.github/workflows/version-drift-gate.yml`
- [ ] Install git pre-commit hook: `cp scripts/hooks/pre-commit-version-check.sh .git/hooks/pre-commit`
- [ ] Add to CONTRIBUTING.md:
  ```
  ## Version Management
  The monorepo uses automated version management. When you commit:
  1. Use conventional commits (feat:, fix:, feat!:)
  2. Pre-commit hook will validate versions
  3. Before release, run: npm run release:prepare
  ```

### Phase 3: Medium Term (This Sprint)
- [ ] Update release process documentation
- [ ] Add version management to team onboarding
- [ ] Configure branch protection rules:
  - Require CI checks pass
  - Require version:check to pass
  - Require pull request reviews

### Phase 4: Long Term (Next Quarter)
- [ ] Integrate with semantic versioning automation tool
- [ ] Add GitHub Actions workflow for automatic version bumping
- [ ] Create dashboard showing current version across all packages

## Commands Reference

```bash
# Check for version drift (CI Gate)
npm run version:check

# Synchronize all versions to root version
npm run version:sync

# Full pre-release preparation
npm run release:prepare

# Check detailed version drift report
npm run version:check

# Manual sync to specific version
npm run version:sync <version>  # e.g., npm run version:sync 2.14.0
```

## Troubleshooting

### Issue: Pre-commit hook not running
```bash
chmod +x .git/hooks/pre-commit
```

### Issue: Version drift still detected
```bash
# Check what's drifting
npm run version:check

# Manually sync
npm run version:sync

# Verify
npm run version:check
```

### Issue: Need to update version mid-development
```bash
# Update root package.json with new version
# Then run:
npm run version:sync

# Commit the changes:
git add .
git commit -m "chore(release): bump version to X.Y.Z"
```

## Best Practices

1. **Single Source of Truth**: Always update `package.json` (root) first
2. **Automated Sync**: Let `npm run version:sync` handle workspace packages
3. **Pre-release Ritual**: Always run `npm run release:prepare` before release
4. **Commit Discipline**: Use conventional commits for automatic version detection
5. **CI/CD Trust**: Let automation enforce version consistency, don't bypass checks

## Related Files
- `scripts/release/sync-workspace-versions.ts` - Synchronization logic
- `scripts/release/version-drift-gate.ts` - Drift detection
- `packages/config/src/authoritativeRelease.ts` - Source of truth
- `scripts/hooks/pre-commit-version-check.sh` - Pre-commit hook
