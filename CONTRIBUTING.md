# Contributing to KwakoPos 2.0

## Version Management

This is a **monorepo with strict version synchronization**. All packages must maintain the same version.

### Key Rules

1. **Single Source of Truth**: Root `package.json` version is authoritative
2. **Automatic Sync**: Always run `npm run version:sync` after updating root version
3. **Pre-commit Validation**: Hooks prevent committing version drift
4. **Pre-release Ceremony**: Must run `npm run release:prepare` before any release

### Workflow

#### Making Changes
```bash
# Make code changes
git add src/...

# Commit using conventional commits
git commit -m "feat(api): add new endpoint"  # minor bump
git commit -m "fix(sync): resolve race condition"  # patch bump
git commit -m "feat!: breaking change"  # major bump

# Pre-commit hook runs automatically
# ✅ If version:check passes → commit succeeds
# ❌ If drift detected → commit blocked with instructions
```

#### Updating Version
```bash
# 1. Update root package.json with new version
nano package.json  # Change "version": "X.Y.Z"

# 2. Synchronize all packages
npm run version:sync

# 3. Verify no drift
npm run version:check  # Should show ✅ PASS

# 4. Commit changes
git add .
git commit -m "chore(release): bump version to X.Y.Z"
```

#### Before Release
```bash
# Run full pre-release preparation
npm run release:prepare

# This performs:
# ✅ Full build
# ✅ Unit tests
# ✅ Version synchronization
# ✅ Workspace package alignment
# ✅ Ready for deployment

# Then create release tag
git tag vX.Y.Z
git push origin vX.Y.Z
```

### Commands Reference

| Command | Purpose |
|---------|---------|
| `npm run version:check` | Detect version drift (**MUST PASS**) |
| `npm run version:sync` | Synchronize all versions to root |
| `npm run release:prepare` | Full pre-release ceremony |
| `npm run version:sync X.Y.Z` | Sync to specific version |

### Common Issues

**Issue: Pre-commit hook not installed**
```bash
chmod +x scripts/hooks/pre-commit-version-check.sh
cp scripts/hooks/pre-commit-version-check.sh .git/hooks/pre-commit
```

**Issue: Version drift detected**
```bash
# Check what's drifting
npm run version:check

# Fix it
npm run version:sync

# Verify
npm run version:check
```

**Issue: Different version in workspace package**
```bash
# Never manually edit workspace package.json versions!
# Always use:
npm run version:sync
```

### Packages to Keep in Sync

| Path | Type | Managed By |
|------|------|-----------|
| `package.json` | Root | You (update manually) |
| `apps/api/package.json` | App | `npm run version:sync` |
| `apps/web/package.json` | App | `npm run version:sync` |
| `packages/contracts/package.json` | Package | `npm run version:sync` |
| `packages/config/package.json` | Package | `npm run version:sync` |
| `packages/domain/package.json` | Package | `npm run version:sync` |
| `packages/database/package.json` | Package | `npm run version:sync` |
| `packages/auth/package.json` | Package | `npm run version:sync` |
| `packages/sync/package.json` | Package | `npm run version:sync` |
| `packages/observability/package.json` | Package | `npm run version:sync` |
| `packages/config/src/authoritativeRelease.ts` | Config | `npm run version:sync` |
| `package-lock.json` | Lock | `npm run version:sync` |

### Why This Matters

The KwakoPos monorepo previously got stuck at version 2.12.5 with 50+ commits ahead due to version drift. This cost:
- ❌ Hours of debugging
- ❌ Version confusion in production
- ❌ Release delays
- ❌ Integration test failures

**Automated version management prevents this entirely.**

### Release Process

```bash
# Step 1: Create feature branches
git checkout -b feat/my-feature

# Step 2: Commit changes with conventional commits
git commit -m "feat: add feature"

# Step 3: Before release, run prep ceremony
npm run release:prepare

# Step 4: CI/CD gates validate
# - version:check MUST pass
# - All tests MUST pass
# - Build MUST succeed

# Step 5: Tag and push
git tag vX.Y.Z
git push origin vX.Y.Z

# Step 6: GitHub Actions deploys automatically
```

**See `docs/VERSION_MANAGEMENT.md` for detailed prevention strategies.**
