export function createManifest(version: string) {
  return {
    manifest_version: 3,
    name: "ApplyAssist",
    version,
    description: "Ajuda a preencher formulários de candidatura. Você revisa e envia.",
    icons: {
      "16": "icons/icon-16.png",
      "32": "icons/icon-32.png",
      "48": "icons/icon-48.png",
      "128": "icons/icon-128.png",
    },
    action: {
      default_title: "ApplyAssist",
      default_icon: {
        "16": "icons/icon-16.png",
        "32": "icons/icon-32.png",
      },
    },
    background: {
      service_worker: "background.js",
      type: "module",
    },
    options_page: "options.html",
    side_panel: {
      default_path: "sidepanel.html",
    },
    permissions: ["activeTab", "scripting", "storage", "sidePanel", "identity"],
    optional_host_permissions: ["https://openrouter.ai/*", "http://localhost:11434/*"],
    commands: {
      "open-paste-mode": {
        suggested_key: {
          default: "Alt+Shift+P",
        },
        description: "Abrir modo colar",
      },
    },
    content_security_policy: {
      extension_pages: "script-src 'self'; object-src 'self'",
    },
  } as const;
}
