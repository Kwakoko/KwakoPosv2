# Permanent Release Lock

The repository treats `package.json` and `package-lock.json` as an atomic contract.

CI must prove that lockfile regeneration produces no diff, `npm ci` succeeds without mutation, package and lock versions match, and the package version is never lower than the latest merged release tag.

Automatic SemVer can repair historical lock drift only in its ephemeral release workspace. Release publication remains centralized and exact production certification remains mandatory.