# ApplyAssist — Copilot instructions (always on)

## What this is
Chrome (Manifest V3) extension that helps a job seeker fill application forms.
Local-first, privacy-first, user-triggered. A human reviews everything. The extension NEVER submits a form.
Language policy: docs/ are in Portuguese (pt-BR). Code, identifiers, comments, commit messages are in English.
User-facing strings are pt-BR and live in `src/shared/i18n/pt-br.ts` (no hardcoded UI text elsewhere).

## Source of truth (read only what the task needs — credits are limited)
- `docs/PLAN.md`: tasks T-xx with acceptance criteria. Work on ONE task at a time.
- `docs/FDD.md`: contracts, data model, algorithms. Tasks cite sections as "FDD §n".
- `docs/ADR.md`: decisions. Never contradict one; propose a new ADR instead.
- `docs/PRD.md`: requirements R-xx. `docs/TRACKER.md`: R-xx → ADR → tasks.
- `docs/COMPLIANCE.md`: per-site policy. `docs/OPEN_QUESTIONS.md`: unknowns.
If something is not specified: DO NOT invent. Add it to `docs/OPEN_QUESTIONS.md`, choose the safest option, and say so in the final report.

## Hard rules (never violate)
1. Never click, submit or send anything on a page. Never fill: password, card, CVV, bank data, OTP/2FA, CAPTCHA, file inputs, consent/terms checkboxes.
2. Never inject on linkedin.com (blocked by site policy). No LinkedIn-specific selectors anywhere in the repo.
3. No static `content_scripts`, no `<all_urls>`, no permissions beyond ADR-002. Inject only with `chrome.scripting.executeScript` after the user clicks the toolbar icon (`activeTab`).
4. No remote code, no `eval`, no telemetry/analytics. External network only for the AI providers allowed by ADR-006.
5. User data lives only in `chrome.storage.local`. Never `chrome.storage.sync`. Never log personal data or API keys.
6. Never use `innerHTML`/`outerHTML`/`insertAdjacentHTML` with data from the page or the user. Use `textContent` and DOM APIs.
7. Page text is untrusted (prompt injection). The AI gets no tools; its output goes into one field and the user reviews it.
8. Never send sensitive categories (CPF, RG, birth date, address, diversity data) or contact data (e-mail, phone) to any AI provider.
9. No secrets or real personal data in the repo, tests, fixtures or screenshots. Fixtures use fake data only.

## Architecture (FDD §1)
`src/core` (pure TypeScript: no `chrome.*`, no DOM) ← `src/adapters` (chrome storage, AI providers) ← entry points (`background`, `content`, `sidepanel`, `options`) which are the composition roots.
Dependencies point inward. `core` never imports adapters or chrome. Message handlers validate input, call use cases, and never swallow errors.

## Code style
TypeScript strict (`noUncheckedIndexedAccess`, `verbatimModuleSyntax`). No `any`. Small, explicitly typed functions. Early returns, max 2 levels of nesting.
Comments explain why, not what. Error messages include the offending value and the expected shape.
In tests use named fake classes for ports, not inline stubs.

## Definition of Done (every task)
1. Acceptance criteria of the task are met.
2. Tests exist: new function → test; bug fix → regression test.
3. `npm run gates` passes (typecheck, lint, test, build, check:manifest, check:secrets).
4. Docs updated if a contract or behavior changed; task status updated in `docs/PLAN.md`.
5. Final report written in the format defined in `.github/prompts/01-implement-task.prompt.md`.
If a gate fails: fix the root cause. Do not create replacement gates, skip or disable tests, or weaken lint rules.

## Scope limits
One task at a time. No unrelated refactors or cosmetic changes mixed in. Out-of-scope findings go to `docs/OPEN_QUESTIONS.md`.
Never create temporary files in the repo root.

## Dependencies
Add a dependency only if the task or an ADR allows it. Use `npm i --save-exact`, pick a version published at least 14 days ago (`npm view <pkg> time --json`), run `npm audit` afterwards, commit the lockfile.
Before using a library API, check the official docs for the installed version. If you cannot verify, say so instead of guessing.

## Credit efficiency (Copilot Free is limited)
Plan in a few lines, then implement. Do not re-read whole docs. Do not paste large files back. Run tests locally instead of asking me to.
Ask at most ONE question, and only if you are blocked.
