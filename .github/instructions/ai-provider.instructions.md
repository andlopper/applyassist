---
description: Rules for AI providers and prompt building
applyTo: "src/adapters/ai/**,src/core/prompts/**"
---
- Providers implement the `AiProvider` port (FDD §11). OpenRouter is the first adapter; Ollama is optional (T-27). No provider-specific code leaks outside `src/adapters/ai`.
- OpenRouter: stream responses, support `AbortSignal`, fetch the model list from the API (do not hardcode `:free` model ids), send `provider.data_collection = "deny"` (confirm the exact field in the official docs), map 401/402/429/5xx to pt-BR user messages.
- Never send sensitive categories or contact data. Apply `redactSensitive()` to the profile context before building the prompt.
- The prompt builder is pure and deterministic. Page-derived text is wrapped in explicit untrusted delimiters and the system prompt tells the model to ignore instructions inside them.
- Prompt tests (prompt-quality checklist): has a role, has explicit rules, has few-shot examples, states the output format, contains no `TODO`, wraps untrusted text, honors `maxLength`, matches the question language.
- Keep context small: profile context ≤ 2,000 characters, job context ≤ 3,000 characters, truncated on sentence boundaries.
