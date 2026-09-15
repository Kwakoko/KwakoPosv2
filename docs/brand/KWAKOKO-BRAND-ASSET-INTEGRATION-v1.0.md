# Kwakoko Brand Asset Integration & Final Brand Lock v1.0

## Authority

The canonical production asset authority is `packages/config/src/visualAssetLibrary.ts`.
Exact brand tokens remain governed by `visualIdentity.ts`; Koko behavior remains governed by `kokoAmbassador.ts`.

## Locked production assets

- `/brand/kwakoko-logo.svg` — primary lockup
- `/brand/kwakoko-mark.svg` — product/app mark
- `/brand/kwakoko-mark-mono.svg` — monochrome mark
- `/brand/favicon.svg` — favicon authority
- `/brand/koko/koko-profile.svg` — canonical vector Koko profile
- `/brand/koko/koko-welcome.svg`
- `/brand/koko/koko-insights.svg`
- `/brand/koko/koko-sync.svg`

## Product integration

The PWA manifest now uses the Kwakoko mark and canonical forest green theme.
The library is intended for app chrome, favicon, onboarding, approved Koko contexts, marketing, and documentation.

## Brand lock rules

Do not redraw the logo locally, introduce uncontrolled color variants, revive legacy DukaPos/KwakoPos branding on customer-facing surfaces, or allow Koko to interfere with authentication, security, authorization, destructive, or critical financial workflows.

## Verification

Run `tsx scripts/release/verify-brand-asset-lock.ts` and the focused Vitest suite before release.

A passing repository gate proves asset wiring and governance only. It does not prove market performance, customer adoption, or production deployment outcomes.
