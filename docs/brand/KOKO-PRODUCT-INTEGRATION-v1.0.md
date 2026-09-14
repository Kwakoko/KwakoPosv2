# Step 5 — Koko Product Integration

## Decision
Koko is a contextual business companion, not a decorative mascot.

## Canonical integration
- Shared component: `apps/web/src/components/KokoCompanion.tsx`
- Canonical definition: `packages/config/src/kokoAmbassador.ts`
- Product contexts: onboarding, sync status, inventory intelligence, business insights.
- Current production touchpoint: authenticated entry/onboarding experience.

## Rules
1. Koko must use the canonical ambassador definition.
2. Product messages must remain concise, professional and action-oriented.
3. Koko must never block or obscure a critical transaction, permission prompt, financial confirmation, or error state.
4. Feature teams must reuse `KokoCompanion`; they must not create independent mascot variants.
5. The visual mark is governed by the Step 4 visual identity tokens.
6. Koko usage must remain contextual; routine screens do not require mascot decoration.

## AI implementation statement
Establish Koko as a governed contextual product companion inside Kwakoko Business Operating System. Reuse one canonical component and canonical message registry across onboarding, synchronization, inventory intelligence, business insights and approved empty states. Prevent feature-specific mascot variants, uncontrolled visual styles, childish language, and mascot usage in critical transactional or security workflows. Ensure all Koko touchpoints inherit the canonical Kwakoko visual identity and remain accessible without relying on imagery alone.
