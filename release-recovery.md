# Automatic SemVer Release Recovery

The release engine uses the latest merged SemVer tag as the authoritative baseline. The repository may temporarily contain stale package version metadata after multiple release-cycle changes; the release preparation step synchronizes it to the latest tag before calculating the next bump.

The automatic release workflow repairs npm lockfile drift in the ephemeral release workspace before `npm ci`, so dependency changes cannot strand the release engine at the previously published version.

The release workflow then validates that the candidate version advances beyond the latest tag and refuses duplicate tags before pushing the release commit and immutable tag.
