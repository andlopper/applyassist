export type SensitiveCategory = "documents" | "birth" | "address" | "diversity";
export type Provider = "none" | "openrouter" | "ollama";
export type SiteOverride = "allow" | "block";

export interface Settings {
  sensitiveEnabled: Record<SensitiveCategory, boolean>;
  provider: Provider;
  openrouter: { model?: string };
  siteOverrides: Record<string, SiteOverride>;
  debug: boolean;
}

const DEFAULT_SENSITIVE_ENABLED: Record<SensitiveCategory, boolean> = {
  documents: false,
  birth: false,
  address: false,
  diversity: false,
};

export const DEFAULT_SETTINGS: Settings = {
  sensitiveEnabled: { ...DEFAULT_SENSITIVE_ENABLED },
  provider: "none",
  openrouter: {},
  siteOverrides: {},
  debug: false,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function normalizeSettings(input: unknown): Settings {
  const fallback = DEFAULT_SETTINGS;
  if (!isRecord(input)) {
    return {
      sensitiveEnabled: { ...fallback.sensitiveEnabled },
      provider: fallback.provider,
      openrouter: { ...fallback.openrouter },
      siteOverrides: { ...fallback.siteOverrides },
      debug: fallback.debug,
    };
  }

  const sensitiveEnabled = { ...DEFAULT_SENSITIVE_ENABLED };
  const rawSensitive = input.sensitiveEnabled;
  if (isRecord(rawSensitive)) {
    for (const category of Object.keys(DEFAULT_SENSITIVE_ENABLED) as SensitiveCategory[]) {
      sensitiveEnabled[category] = rawSensitive[category] === true;
    }
  }

  const provider = input.provider === "openrouter" || input.provider === "ollama" ? input.provider : "none";
  const openrouter = isRecord(input.openrouter)
    ? { model: typeof input.openrouter.model === "string" ? input.openrouter.model : undefined }
    : {};

  const siteOverrides: Record<string, SiteOverride> = {};
  if (isRecord(input.siteOverrides)) {
    for (const [domain, override] of Object.entries(input.siteOverrides)) {
      if (override === "allow" || override === "block") {
        siteOverrides[domain] = override;
      }
    }
  }

  return {
    sensitiveEnabled,
    provider,
    openrouter,
    siteOverrides,
    debug: typeof input.debug === "boolean" ? input.debug : false,
  };
}
