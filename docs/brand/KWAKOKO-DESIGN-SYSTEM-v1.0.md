# Kwakoko Design System v1.0

## Purpose
The Kwakoko Design System is the canonical UI foundation for Kwakoko Business Operating System. It turns the visual identity into reusable, accessible, responsive product rules.

## Foundations
- Primary typeface: Inter.
- Technical typeface: JetBrains Mono.
- Spacing base: 4px.
- Minimum interactive target: 44px.
- Keyboard focus is mandatory.
- Reduced-motion behavior is mandatory.

## Semantic Tokens
Components must consume Kwakoko semantic tokens before introducing local overrides. Brand tokens are Forest, Deep, Gold, Sand, Cloud, Ink and Slate. Feedback tokens are Signal Blue, Success, Warning and Danger.

## Governed Components
The required baseline is Button, Input, Select, Card, Badge, Modal, Toast, Table, EmptyState, LoadingState and ErrorState. Existing semantic CSS components may satisfy a component contract; duplication is not required when the contract is already met.

## Interaction Rules
Primary actions must be visually distinct. Destructive actions require confirmation. Icon-only controls require an accessible label. Loading states must not block unrelated work. Empty states must provide a meaningful next step.

## Accessibility Rules
Never rely on color alone for status. Preserve visible keyboard focus. Respect `prefers-reduced-motion`. Forms require accessible labels. Responsive behavior is mobile-first with the canonical breakpoints.

## Governance
Raw brand colors should not be introduced in new reusable components when a semantic token exists. Critical product UI must use the design-system source of truth. CI runs the design-system verifier before release certification.

## Certification
The release gate produces `KWAKOKO-DESIGN-SYSTEM-CERTIFICATE-v1.0`. A failure blocks certification until the source of truth, CSS foundations, accessibility baseline, or component contract is restored.
