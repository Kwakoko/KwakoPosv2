# Permanent Release Integrity Lock

`package.json` and `package-lock.json` are one atomic dependency/version contract. Pull requests and pushes to `main` must prove reproducible lockfile state, clean `npm ci`, matching versions, and non-regressing SemVer. Automatic SemVer may recover drift only in its ephemeral workspace; committed repository integrity remains mandatory.