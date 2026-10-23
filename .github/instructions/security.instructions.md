---
description: Security rules for every source file
applyTo: "src/**"
---
- Validate every runtime message: `sender.id === chrome.runtime.id`, payload matches its schema, unknown `type` is ignored (log the type only, never the payload).
- The content script receives only the values it asked for (least data). Never send the whole profile to a page context.
- Overlay UI lives in a Shadow DOM. Never trust or render page-provided strings as HTML.
- Skip hidden, occluded, off-screen, readonly or disabled fields (FDD §5). Treat tiny/invisible fields as honeypots and never fill them.
- Forbidden field kinds are never read, filled or learned (FDD §4.4).
- Secrets (API keys) are read only in the background/service-worker context, stored under `secrets:v1`, never logged, never passed to content scripts.
- Do not declare `web_accessible_resources`, `externally_connectable` or broad `host_permissions`. Optional hosts are requested at runtime with `chrome.permissions.request` from a user gesture.
- Do not add `eval`, `new Function`, inline event handlers, remote scripts or remote fonts.
- Errors shown to the user are pt-BR and generic; technical details go to the local debug logger without PII.
