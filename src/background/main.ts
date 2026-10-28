import {
  createChromeStorageAdapter,
  STORAGE_SCHEMA_VERSION,
  type StorageAdapter,
} from "../adapters/storage";
import { getSitePolicy, type SiteOverrides } from "../core/policy/site-policy";
import { isSensitiveFieldBlocked } from "../core/policy";
import { FIELD_KEYS, type FieldKey } from "../core/matching/field-key";
import { ptBr } from "../shared/i18n/pt-br";
import { registerMessageRouter, type RuntimePort } from "./router";

interface BrowserTab {
  id?: number;
  url?: string;
}

export interface BackgroundChrome {
  runtime: RuntimePort;
  action: {
    onClicked: {
      addListener(listener: (tab: BrowserTab) => void): void;
    };
    setBadgeText(details: { text: string; tabId: number }): Promise<void>;
    setTitle(details: { title: string; tabId: number }): Promise<void>;
  };
  scripting: {
    executeScript(details: { target: { tabId: number }; files: string[] }): Promise<unknown>;
  };
  sidePanel: {
    open(details: { tabId: number }): Promise<void>;
  };
}

const SETTINGS_STORAGE_KEY = "settings:v1";
const PROFILE_STORAGE_KEY = "profile:v1";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFieldKey(value: string): value is FieldKey {
  return FIELD_KEYS.some((fieldKey) => fieldKey === value);
}

async function getFillValues(
  storage: StorageAdapter,
  fieldKeys: readonly string[],
): Promise<{ values: Partial<Record<FieldKey, string>> } | { error: true }> {
  const storedProfile = await storage.getItem(PROFILE_STORAGE_KEY);
  if (storedProfile === undefined) {
    return { values: {} };
  }
  if (
    !isRecord(storedProfile) ||
    storedProfile.schemaVersion !== STORAGE_SCHEMA_VERSION ||
    !isRecord(storedProfile.value) ||
    !isRecord(storedProfile.value.values)
  ) {
    return { error: true };
  }

  const values: Partial<Record<FieldKey, string>> = {};
  for (const key of fieldKeys) {
    if (!isFieldKey(key) || isSensitiveFieldBlocked(key)) {
      continue;
    }
    const value = storedProfile.value.values[key];
    if (typeof value === "string" && value.trim().length > 0) {
      values[key] = value;
    }
  }

  return { values };
}

function readSiteOverrides(stored: unknown): SiteOverrides {
  if (stored === undefined) {
    return {};
  }

  if (
    !isRecord(stored) ||
    stored.schemaVersion !== STORAGE_SCHEMA_VERSION ||
    !isRecord(stored.value)
  ) {
    console.warn("Invalid stored site overrides; using no overrides.");
    return {};
  }

  const rawOverrides = stored.value.siteOverrides;
  if (rawOverrides === undefined) {
    return {};
  }
  if (!isRecord(rawOverrides)) {
    console.warn("Invalid stored site overrides; using no overrides.");
    return {};
  }

  const overrides: Record<string, "allow" | "block"> = {};
  for (const [domain, override] of Object.entries(rawOverrides)) {
    if (override === "allow" || override === "block") {
      overrides[domain] = override;
      continue;
    }
    console.warn("Invalid stored site override; ignoring the invalid entry.");
  }

  return overrides;
}

async function showActivationError(chrome: BackgroundChrome, tabId: number): Promise<void> {
  await Promise.all([
    chrome.action.setBadgeText({ text: "!", tabId }),
    chrome.action.setTitle({ title: ptBr.backgroundPageUnavailable, tabId }),
  ]);
}

async function clearActivationError(chrome: BackgroundChrome, tabId: number): Promise<void> {
  await Promise.all([
    chrome.action.setBadgeText({ text: "", tabId }),
    chrome.action.setTitle({ title: ptBr.extensionName, tabId }),
  ]);
}

async function showUnverifiedWarning(chrome: BackgroundChrome, tabId: number): Promise<void> {
  await Promise.all([
    chrome.action.setBadgeText({ text: "?", tabId }),
    chrome.action.setTitle({ title: ptBr.backgroundUnverifiedSite, tabId }),
  ]);
}

export async function handleActionClick(
  chrome: BackgroundChrome,
  storage: StorageAdapter,
  tab: BrowserTab,
): Promise<void> {
  if (typeof tab.id !== "number" || !Number.isInteger(tab.id)) {
    return;
  }

  const tabId = tab.id;

  try {
    if (typeof tab.url !== "string") {
      throw new Error("Active tab URL is unavailable.");
    }

    const storedSettings = await storage.getItem(SETTINGS_STORAGE_KEY);
    const siteOverrides = readSiteOverrides(storedSettings);
    const sitePolicy = getSitePolicy(tab.url, siteOverrides);

    if (sitePolicy === "blocked") {
      await clearActivationError(chrome, tabId);
      await chrome.sidePanel.open({ tabId });
      return;
    }

    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"],
    });
    if (sitePolicy === "unverified") {
      await showUnverifiedWarning(chrome, tabId);
    } else {
      await clearActivationError(chrome, tabId);
    }
  } catch {
    await showActivationError(chrome, tabId);
  }
}

declare const chrome: BackgroundChrome;

export function registerBackground(
  chromeApi: BackgroundChrome = chrome,
  storage: StorageAdapter = createChromeStorageAdapter(),
): void {
  chromeApi.action.onClicked.addListener((tab) => {
    void handleActionClick(chromeApi, storage, tab).catch(() => {
      console.error("Unable to report ApplyAssist activation failure.");
    });
  });
  registerMessageRouter(chromeApi.runtime, (message) => {
    if (message.type === "GET_FILL_VALUES") {
      return getFillValues(storage, message.fieldKeys);
    }
  });
}

if (typeof chrome !== "undefined") {
  registerBackground(chrome);
}
