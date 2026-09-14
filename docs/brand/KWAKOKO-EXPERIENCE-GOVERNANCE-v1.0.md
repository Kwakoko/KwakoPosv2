# Kwakoko Experience Governance v1.0

## Purpose

Kwakoko Experience Governance is the engineering control plane for brand, UX, interaction, function, localization, and AI-generated product experience.

## Authority

The machine-readable authority is `packages/config/src/experienceGovernance.ts`.

The registry governs eight layers:

1. Brand
2. Voice
3. Visual
4. UI
5. Interaction
6. Function
7. Localization
8. AI agent behavior

## Closed-loop rules

- Canonical brand authorities remain the single source of truth.
- Explicitly governed UI actions must expose a real interaction path or an approved disabled state.
- Explicitly governed capabilities must declare a discoverable path or be marked internal-only.
- Roadmap capability must never be presented as currently available.
- AI agents must use canonical terminology, positioning, voice, visual tokens, and Koko governance.
- Koko must remain inside approved product contexts and must not interfere with critical transactions.

## Orphan detection

The verifier has two levels. Explicit governance markers are fail-closed. Legacy heuristic findings are reported for remediation without breaking existing builds until their controls are classified.

The current heuristics identify likely buttons without interaction/classification and provide a migration path toward complete UI-to-function traceability.

## CI gate

`npm run experience:verify` is a required CI quality gate immediately after brand integrity verification.

The gate emits `artifacts/release/KWAKOKO-EXPERIENCE-CERTIFICATE-v1.0.json`.

## AI implementation rule

No AI coding agent may introduce a customer-facing interaction, capability, brand phrase, visual treatment, or Koko usage that bypasses the canonical Kwakoko governance registry.
