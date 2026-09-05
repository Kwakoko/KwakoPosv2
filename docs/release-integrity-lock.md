# Release Integrity Lock

KwakoPos treats `package.json` and the committed `package-lock.json` as one atomic dependency/version contract.

Every pull request and every push to `main` must prove that regenerating the lock metadata produces no diff, `npm ci` succeeds, and package/version metadata remains aligned.

The Automatic SemVer workflow may perform an ephemeral lockfile repair before installation so historical drift cannot deadlock release automation. That repair is not a substitute for the required integrity gate; the committed repository must remain reproducible.

SemVer is monotonic against the latest merged release tag. Release publication remains centralized in Automatic SemVer, and production certification must pass for the exact release SHA before promotion.
