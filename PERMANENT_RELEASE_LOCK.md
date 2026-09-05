# Permanent Release Lock

The release system is protected by CI checks that prove the committed npm lockfile is reproducible, `npm ci` is clean, package and lock versions match, and SemVer never regresses below the latest release tag.

Automatic SemVer may recover dependency drift inside its ephemeral workspace, but the committed repository must remain clean and reproducible.