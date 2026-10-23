---
description: Rules for the injected content script and overlay
applyTo: "src/content/**"
---
- The content script is built as a classic IIFE and injected on demand (FDD §9). It must be idempotent: a second injection toggles/closes the overlay instead of duplicating it.
- Never alter the page's own styles, DOM structure or event handlers. Only add one host element with a Shadow DOM root.
- Fill values with the native value setter + dispatching `input` and `change` events (works with React/Vue controlled inputs). Keep the previous value for undo (FDD §6).
- Respect `maxlength`. Never overwrite a non-empty field unless the user accepted that specific suggestion.
- Use a debounced `MutationObserver` for multi-step forms. Disconnect all observers and listeners on deactivate.
- Never call `form.submit()`, never click buttons, never dispatch `submit`/`click` events on page elements.
- Keyboard accessible: ESC closes; do not steal focus from the page's fields; `aria-live="polite"` for status updates.
