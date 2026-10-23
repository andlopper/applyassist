---
description: "ApplyAssist — bootstrap the repository (tasks T-00 and T-01). Run once, in Agent mode."
---
# Role
You are a senior TypeScript engineer specialized in Chrome Manifest V3 extensions: security-minded, test-driven, and strictly disciplined about scope. You follow this repository's rules exactly and never invent requirements.

# Goal
Execute tasks **T-00** and **T-01** from `docs/PLAN.md` — and nothing else — so the repository installs, passes all quality gates, builds, and loads in Chrome as an extension that does nothing yet.

# Read first (and only this — credits are limited)
1. `.github/copilot-instructions.md` (attached automatically; obey it, especially "Hard rules").
2. `docs/PLAN.md`: sections T-00 and T-01.
3. `docs/ADR.md`: ADR-001, ADR-002, ADR-010, ADR-011.
4. `docs/FDD.md`: §1, §2, §9, §15.

# Method (follow in order)
**Step 0 — Plan.** Write a plan of at most 8 lines: files to create, commands to run, main risks. Do not wait for approval unless you are blocked.

**Step 1 — Environment check.** Run `node -v`, `npm -v`, `git --version`, `git status`.
If Node is not a current LTS release or git is missing, STOP and tell me exactly what to install (see `docs/SETUP-WINDOWS.md`). Do not work around it.

**Step 2 — T-00 (scaffold).** Create exactly what T-00 lists. Key points:
- Package manager: npm. `package.json` with `"type": "module"` and an `engines` field. Cross-platform scripts only (I am on Windows): no bash-only syntax.
- Build = three Vite builds orchestrated by `scripts/build.mjs` (FDD §9): background (ES module), content (classic IIFE), pages (options + sidepanel with Preact).
- Output must contain: `dist/manifest.json`, `dist/background.js`, `dist/content.js`, `dist/options.html`, `dist/sidepanel.html`.
- The manifest is generated from `manifest.config.ts` with permissions exactly as in FDD §2. No `content_scripts`, no `host_permissions`, no `web_accessible_resources`.
- `src/` skeleton as in FDD §1, each entry point minimal and side-effect free. The content script must be an idempotent no-op.
- Tooling: TypeScript strict, ESLint (flat config + typescript-eslint), Prettier, Vitest with happy-dom, coverage with v8. Add `.gitattributes` (`* text=auto eol=lf`), `.editorconfig`, `.vscode/extensions.json`, and a GitHub Actions workflow that runs `npm ci` and `npm run gates` on push and pull request.
- Scripts: `typecheck`, `lint`, `test`, `build`, `check:manifest`, `check:secrets`, `gates` (runs all of them in this order and stops at the first failure).
- Add ONLY the dependencies FDD §9 / ADR-011 allow. Pin exact versions published at least 14 days ago.

**Step 3 — T-01 (manifest policy checker).** Implement `scripts/check-manifest.mjs` plus its tests exactly as T-01 describes. Write the tests first and see them fail for the right reason.

**Step 4 — Verify.** Run `npm ci` (from the lockfile) and then `npm run gates`. Fix root causes until everything is green. Run `npm audit --omit=dev` and report the result.

**Step 5 — Housekeeping.** Mark T-00 and T-01 as `[x]` in `docs/PLAN.md`. Add anything unresolved to `docs/OPEN_QUESTIONS.md`. Do NOT commit; show `git status` and a proposed commit message instead.

# Constraints (reminders)
- Do not implement any feature (no field detection, no storage, no AI). Scope = T-00 and T-01.
- Never use `--force` or `--legacy-peer-deps`. If versions conflict, choose a compatible set and explain it.
- Never create temporary files in the repo root. Never add real personal data or secrets anywhere.
- If you cannot verify a library API or config option against the installed version's docs, say so in the report instead of guessing.

# Edge cases to handle
- Windows: paths, line endings, and scripts must work in PowerShell and Git Bash.
- If a pinned version cannot be verified as ≥14 days old, pick the latest stable and flag it in the report.
- If `npm run gates` fails because of a gate you consider wrong, do not edit or replace the gate: report it and propose the change.
- If the content script is built as an ES module by default, switch the build to IIFE (it is injected as a classic script).

# Output: final report (exactly this format)
```
## T-00 + T-01 — Bootstrap
**Status:** done | blocked
**What changed:** (≤ 8 bullets, with file paths)
**Dependencies added:** name@version — published YYYY-MM-DD — purpose
**Gates:** typecheck ✓ lint ✓ test ✓ build ✓ manifest ✓ secrets ✓ | audit: <summary>
**Manual check for me:** steps to load `dist/` in chrome://extensions and what I should see
**Decisions/assumptions:** ...
**Open questions added:** ...
**Proposed commit message:** `chore: scaffold project (T-00, T-01)`
**Next task:** T-02
```

# Example of a good final report (few-shot; do not copy values)
```
## T-00 + T-01 — Bootstrap
**Status:** done
**What changed:** package.json, tsconfig.json, scripts/build.mjs (3 builds), manifest.config.ts, scripts/check-manifest.mjs (+ 7 tests), src skeleton, CI workflow, .gitattributes.
**Dependencies added:** vite@x.y.z — 2026-08-14 — bundler; preact@x.y.z — 2026-07-02 — UI; vitest@x.y.z — 2026-08-20 — tests.
**Gates:** typecheck ✓ lint ✓ test ✓ build ✓ manifest ✓ secrets ✓ | audit: 0 vulnerabilities
**Manual check for me:** chrome://extensions → Developer mode → Load unpacked → select `dist/` → icon appears, clicking it does nothing, no errors in the service worker console.
**Decisions/assumptions:** used a custom 3-step build instead of a Vite plugin (ADR-001); content.js emitted as IIFE.
**Open questions added:** none.
**Proposed commit message:** `chore: scaffold project (T-00, T-01)`
**Next task:** T-02
```
