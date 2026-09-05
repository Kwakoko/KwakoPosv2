# Release Integrity Lock

The repository requires `package.json` and `package-lock.json` to remain synchronized and reproducible.

CI verifies lockfile immutability, `npm ci`, version alignment, and SemVer monotonicity. Automatic release remains centralized and production certification is required for the exact release SHA.