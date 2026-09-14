# Kwakoko Voice & Tone System v1.0

## Purpose

This specification defines how Kwakoko communicates across product interfaces, support, documentation, marketing, analytics, notifications, and Koko companion experiences.

## Canonical voice

Kwakoko sounds **clear, confident, calm, helpful, professional, grounded, and human**.

The working rule is:

> **Be clear enough to act, confident enough to trust, and human enough to understand.**

Kwakoko is not loud, childish, vague, or hype-driven. It does not use unnecessary corporate jargon or hide important system states behind friendly language.

## Tone by context

| Context | Tone | Copy rule |
|---|---|---|
| Operational UI | Concise, direct | Lead with the action or status. |
| Guidance | Encouraging, practical | Explain enough to make the next action clear. |
| Alerts | Calm, precise | State what happened, impact, and safest next action. |
| Executive insights | Analytical, factual | Separate evidence from interpretation. |
| Marketing | Confident, evidence-led | Sell value without unsupported superlatives. |
| Koko | Warm, professional | Add human guidance without weakening clarity. |

## Customer-facing language rules

Use active voice, plain language, specific actions, and consistent terminology. Prefer short sentences. Avoid blame, fear, hype, unexplained acronyms, excessive punctuation, slang, and childish expressions.

Do not use claims such as market leadership, guaranteed growth, guaranteed savings, 100% security, zero downtime, or other unsupported absolutes.

Errors must explain the state and recovery path. Never use labels such as “user error” or wording that shames the operator.

## Canonical terminology

- **Kwakoko** — master brand
- **Kwakoko Business Operating System** — flagship platform
- **KwakoPos** — POS capability
- **Business Operating System** — category
- **offline-first** — platform resilience characteristic
- **sync** — synchronization workflow
- **branch** — operational location
- **business account** — customer-facing term where tenant-level technical terminology would be confusing

Technical terms may remain when they materially improve accuracy, but they must be explained when the audience is non-technical.

## Localization

English is the source-language authority for meaning. Supported product languages are **English, Kiswahili, and French**.

Localization must preserve business intent, safety meaning, product names, placeholders, figures, and operational distinctions. Kiswahili should be natural and professional for Tanzanian business users. French should be professional international French. Brand names **Kwakoko, KwakoPos, Koko** remain unchanged unless an explicitly approved localized form is introduced.

## Koko voice overlay

Koko is a contextual companion, not a replacement for product voice. Koko may be warmer and use light encouragement, but must remain professional. Koko must not interrupt critical transactions, security decisions, or legally consequential confirmations. Koko simplifies explanations without changing the underlying meaning.

## AI generation standard

AI-generated product copy must follow this specification before release. Generated language must be checked for prohibited claims, blameful wording, terminology drift, localization drift, and inappropriate Koko behavior.

## Governance

This specification is the voice-and-tone authority for future product copy. Changes require a versioned specification update plus passing governance tests. CI executes the brand verifier, which includes voice-system invariants.
