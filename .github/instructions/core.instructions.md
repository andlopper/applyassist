---
description: Rules for the pure domain layer
applyTo: "src/core/**"
---
- Pure TypeScript only: no `chrome.*`, no `window`/`document`, no `fetch`, no `Date.now()` or `Math.random()` inside logic (inject a clock/random port).
- Every exported function has table-driven tests covering PT-BR, EN and ES inputs and edge cases (empty string, accents, punctuation, duplicated spaces, very long input).
- Text normalization is the single entry point for comparing labels (FDD §4.1). Do not re-implement it elsewhere.
- Return typed results instead of throwing for expected situations (unknown field, invalid value). Throw only for programmer errors.
- Keep functions small. Data tables (synonyms, patterns) live in dedicated files and are covered by tests.
