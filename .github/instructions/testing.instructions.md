---
description: Testing rules
applyTo: "**/*.test.ts,**/*.test.tsx,tests/**"
---
- Arrange–Act–Assert. One behavior per test. Descriptive names ("returns salaryExpectation for 'desired salary'").
- Pyramid: many unit tests in `src/core`; integration tests for adapters and content logic with happy-dom; few e2e tests (Playwright) for critical flows only.
- No real network, no real chrome APIs: use named fake classes (`FakeStorage`, `FakeChromeRuntime`, `FakeAiProvider`).
- Fixtures contain fake data only (fake names, placeholder documents). Never copy real forms or real profiles.
- Coverage targets: `src/core` ≥ 90% lines, overall ≥ 80%. Do not exclude files to hit the target.
- A bug fix starts with a failing regression test.
