import {
  createChromeStorageAdapter,
  STORAGE_SCHEMA_VERSION,
  type StorageAdapter,
} from "../adapters/storage";
import { getSitePolicy, type SiteOverrides } from "../core/policy/site-policy";
import { isSensitiveFieldBlocked } from "../core/policy";
import {
  isLikelyDuplicate,
  normalizeUrl,
  type ApplicationRecord,
} from "../core/applications";
import { FIELD_KEYS, type FieldKey } from "../core/matching/field-key";
import type { LearnedMapping as MatchingLearnedMapping } from "../core/matching";
import {
  learnFromEvent,
  type AnswerMemory,
  type LearnedMapping,
  type LearningConflict,
} from "../core/learning";
import {
  buildProfileContext,
  redactSensitive,
  truncateForContext,
} from "../core/profile";
import { ptBr } from "../shared/i18n/pt-br";
import {
  isAiGenerationPortCommand,
  type AiGenerationPortCommand,
  type AiGenerationPortEvent,
  type RuntimeMessage,
} from "../shared/messages";
import { normalizeSettings } from "../shared/types";
import {
  AiProviderError,
  OpenRouterProvider,
  type AiProvider,
  type GenerateRequest,
} from "../adapters/ai";
import { registerMessageRouter, type RuntimePort, type RuntimeSender } from "./router";

interface BrowserTab {
  id?: number;
  url?: string;
}

export interface BackgroundChrome {
  runtime: RuntimePort & {
    onConnect: {
      addListener(listener: (port: BackgroundAiPort) => void): void;
    };
  };
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

export interface BackgroundAiPort {
  name: string;
  sender?: RuntimeSender;
  postMessage(message: AiGenerationPortEvent): void;
  disconnect(): void;
  onMessage: {
    addListener(listener: (message: unknown) => void): void;
    removeListener(listener: (message: unknown) => void): void;
  };
  onDisconnect: {
    addListener(listener: () => void): void;
    removeListener(listener: () => void): void;
  };
}

const SETTINGS_STORAGE_KEY = "settings:v1";
const PROFILE_STORAGE_KEY = "profile:v1";
const SECRETS_STORAGE_KEY = "secrets:v1";
const MAX_JOB_CONTEXT_LENGTH = 3000;
const SENSITIVE_CONTEXT_LABELS = [
  "cpf",
  "rg",
  "birth date",
  "date of birth",
  "fecha de nacimiento",
  "nascimento",
  "data de nascimento",
  "endereco",
  "address",
  "direccion",
  "domicilio",
  "cep",
  "postal code",
  "zip code",
  "codigo postal",
  "gender",
  "genero",
  "race",
  "raca",
  "pcd",
  "disability",
  "email",
  "e-mail",
  "phone",
  "telefone",
  "telefono",
  "telephone",
] as const;

export type AiProviderFactory = (apiKey: string) => AiProvider;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFieldKey(value: string): value is FieldKey {
  return FIELD_KEYS.some((fieldKey) => fieldKey === value);
}

function isLearnedMapping(value: unknown): value is LearnedMapping {
  return (
    isRecord(value) &&
    typeof value.labelNorm === "string" &&
    isFieldKey(String(value.fieldKey)) &&
    typeof value.reviewed === "boolean" &&
    typeof value.hits === "number" &&
    Number.isInteger(value.hits) &&
    typeof value.lastSeen === "string" &&
    (value.host === undefined || typeof value.host === "string")
  );
}

function isAnswerMemory(value: unknown): value is AnswerMemory {
  return (
    isRecord(value) &&
    typeof value.labelNorm === "string" &&
    typeof value.answer === "string" &&
    (value.scope === "host" || value.scope === "job") &&
    typeof value.host === "string" &&
    (value.jobKey === undefined || typeof value.jobKey === "string") &&
    typeof value.reviewed === "boolean" &&
    typeof value.createdAt === "string"
  );
}

function isLearningConflict(value: unknown): value is LearningConflict {
  return (
    isRecord(value) &&
    isFieldKey(String(value.fieldKey)) &&
    typeof value.stored === "string" &&
    typeof value.seen === "string" &&
    typeof value.host === "string" &&
    typeof value.createdAt === "string"
  );
}

function isApplicationRecord(value: unknown): value is ApplicationRecord {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.urlNorm === "string" &&
    typeof value.host === "string" &&
    (value.title === undefined || typeof value.title === "string") &&
    (value.company === undefined || typeof value.company === "string") &&
    typeof value.createdAt === "string" &&
    (value.status === "started" || value.status === "submitted_by_user")
  );
}

function readLearningCollection<T>(
  stored: unknown,
  key: string,
  isItem: (value: unknown) => value is T,
): T[] {
  if (stored === undefined) {
    return [];
  }
  if (
    !isRecord(stored) ||
    stored.schemaVersion !== STORAGE_SCHEMA_VERSION ||
    !Array.isArray(stored.value) ||
    !stored.value.every(isItem)
  ) {
    throw new Error(`Invalid stored learning collection for ${key}.`);
  }
  return stored.value;
}

function readIgnoredLabels(stored: unknown): string[] {
  if (stored === undefined) {
    return [];
  }
  if (
    !isRecord(stored) ||
    stored.schemaVersion !== STORAGE_SCHEMA_VERSION ||
    !Array.isArray(stored.value) ||
    !stored.value.every((label) => typeof label === "string")
  ) {
    throw new Error("Invalid stored ignored labels.");
  }
  return stored.value;
}

function readApplications(stored: unknown): ApplicationRecord[] {
  if (stored === undefined) {
    return [];
  }
  if (
    !isRecord(stored) ||
    stored.schemaVersion !== STORAGE_SCHEMA_VERSION ||
    !Array.isArray(stored.value) ||
    !stored.value.every(isApplicationRecord)
  ) {
    throw new Error("Invalid stored applications.");
  }
  return stored.value;
}

async function readProfileValues(
  storage: StorageAdapter,
): Promise<Partial<Record<FieldKey, string>>> {
  const stored = await storage.getItem(PROFILE_STORAGE_KEY);
  if (stored === undefined) {
    return {};
  }
  if (
    !isRecord(stored) ||
    stored.schemaVersion !== STORAGE_SCHEMA_VERSION ||
    !isRecord(stored.value) ||
    !isRecord(stored.value.values)
  ) {
    throw new Error("Invalid stored profile for learning.");
  }

  const profile: Partial<Record<FieldKey, string>> = {};
  for (const fieldKey of FIELD_KEYS) {
    const value = stored.value.values[fieldKey];
    if (value !== undefined && typeof value !== "string") {
      throw new Error(`Invalid stored profile value for ${fieldKey}.`);
    }
    if (typeof value === "string") {
      profile[fieldKey] = value;
    }
  }
  return profile;
}

interface AiGenerationConfiguration {
  apiKey: string;
  model: string;
}

async function getAiGenerationConfiguration(
  storage: StorageAdapter,
): Promise<AiGenerationConfiguration | undefined> {
  const storedSettings = await storage.getItem(SETTINGS_STORAGE_KEY);
  if (storedSettings === undefined) {
    return undefined;
  }
  if (
    !isRecord(storedSettings) ||
    storedSettings.schemaVersion !== STORAGE_SCHEMA_VERSION ||
    !isRecord(storedSettings.value)
  ) {
    throw new Error("Invalid stored AI settings.");
  }

  const settings = normalizeSettings(storedSettings.value);
  if (settings.provider !== "openrouter" || !settings.openrouter.model) {
    return undefined;
  }

  const storedSecrets = await storage.getItem(SECRETS_STORAGE_KEY);
  if (storedSecrets === undefined) {
    return undefined;
  }
  if (!isRecord(storedSecrets) || typeof storedSecrets.apiKey !== "string") {
    throw new Error("Invalid stored AI secret.");
  }

  const apiKey = storedSecrets.apiKey.trim();
  return apiKey.length > 0 ? { apiKey, model: settings.openrouter.model } : undefined;
}

function getSafeSelectedText(selectedText: string | undefined): string | undefined {
  if (selectedText === undefined) {
    return undefined;
  }

  const safeLines: string[] = [];
  let skipNextValue = false;
  for (const line of selectedText.split(/\r?\n/)) {
    const normalizedLine = line.toLocaleLowerCase("pt-BR")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    const hasSensitiveLabel = SENSITIVE_CONTEXT_LABELS.some((label) =>
      normalizedLine.includes(label),
    );
    if (hasSensitiveLabel) {
      skipNextValue = /[:=]\s*$/.test(line);
      continue;
    }
    if (skipNextValue) {
      if (line.trim().length > 0) {
        skipNextValue = false;
      }
      continue;
    }
    safeLines.push(line);
  }

  const redacted = redactSensitive(safeLines.join("\n"));
  const truncated = truncateForContext(redacted, MAX_JOB_CONTEXT_LENGTH);
  return truncated.length > 0 ? truncated : undefined;
}

function isAuthorizedAiPort(
  port: BackgroundAiPort,
  extensionId: string,
): boolean {
  if (port.sender?.id !== extensionId) {
    return false;
  }
  if (port.sender.tab !== undefined) {
    return typeof port.sender.tab.id === "number" && Number.isInteger(port.sender.tab.id);
  }
  return port.sender.url?.startsWith(`chrome-extension://${extensionId}/`) === true;
}

function createAiGenerationRequest(
  command: Extract<AiGenerationPortCommand, { type: "AI_GENERATE" }>,
  configuration: AiGenerationConfiguration,
  profileValues: Partial<Record<FieldKey, string>>,
): GenerateRequest {
  const selectedText = getSafeSelectedText(command.selectedText);
  return {
    question: truncateForContext(redactSensitive(command.question), MAX_JOB_CONTEXT_LENGTH),
    language: command.language,
    model: configuration.model,
    profileContext: buildProfileContext({ values: profileValues, updatedAt: "" }),
    ...(command.maxLength !== undefined ? { maxLength: command.maxLength } : {}),
    ...(selectedText ? { jobContext: { selectedText } } : {}),
  };
}

function registerAiGeneration(
  chromeApi: BackgroundChrome,
  storage: StorageAdapter,
  providerFactory: AiProviderFactory,
): void {
  chromeApi.runtime.onConnect.addListener((port) => {
    if (port.name !== "AI_GENERATE") {
      return;
    }
    if (!isAuthorizedAiPort(port, chromeApi.runtime.id)) {
      port.disconnect();
      return;
    }

    let activeController: AbortController | undefined;
    let isConnected = true;
    let isGenerating = false;

    const post = (event: AiGenerationPortEvent): void => {
      if (isConnected) {
        port.postMessage(event);
      }
    };

    const runGeneration = async (
      command: Extract<AiGenerationPortCommand, { type: "AI_GENERATE" }>,
      controller: AbortController,
    ): Promise<void> => {
      try {
        const configuration = await getAiGenerationConfiguration(storage);
        if (!configuration || controller.signal.aborted) {
          post({ type: "AI_ERROR", code: "unavailable" });
          return;
        }

        const profileValues = await readProfileValues(storage);
        if (controller.signal.aborted) {
          return;
        }
        const request = createAiGenerationRequest(command, configuration, profileValues);
        const provider = providerFactory(configuration.apiKey);
        for await (const chunk of provider.generate(request, controller.signal)) {
          if (controller.signal.aborted) {
            return;
          }
          post({ type: "AI_CHUNK", text: chunk });
        }
        if (!controller.signal.aborted) {
          post({ type: "AI_DONE" });
        }
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        post({
          type: "AI_ERROR",
          code: error instanceof AiProviderError && error.code === "daily-limit"
            ? "daily-limit"
            : "unavailable",
        });
      } finally {
        activeController = undefined;
        isGenerating = false;
      }
    };

    const handleMessage = (message: unknown): void => {
      if (!isAiGenerationPortCommand(message)) {
        post({ type: "AI_ERROR", code: "unavailable" });
        return;
      }
      if (message.type === "AI_ABORT") {
        activeController?.abort();
        return;
      }
      if (isGenerating) {
        post({ type: "AI_ERROR", code: "unavailable" });
        return;
      }

      isGenerating = true;
      const controller = new AbortController();
      activeController = controller;
      void runGeneration(message, controller);
    };

    const handleDisconnect = (): void => {
      isConnected = false;
      activeController?.abort();
      port.onMessage.removeListener(handleMessage);
      port.onDisconnect.removeListener(handleDisconnect);
    };

    port.onMessage.addListener(handleMessage);
    port.onDisconnect.addListener(handleDisconnect);
  });
}

async function handleLearningEvent(
  storage: StorageAdapter,
  message: Extract<RuntimeMessage, { type: "LEARN_EVENT" }>,
): Promise<{ kind: string }> {
  const [profile, mappings, answers, conflicts, ignoredLabels] = await Promise.all([
    readProfileValues(storage),
    storage
      .getItem("mappings:v1")
      .then((value) => readLearningCollection(value, "mappings:v1", isLearnedMapping)),
    storage
      .getItem("answers:v1")
      .then((value) => readLearningCollection(value, "answers:v1", isAnswerMemory)),
    storage
      .getItem("conflicts:v1")
      .then((value) => readLearningCollection(value, "conflicts:v1", isLearningConflict)),
    storage.getItem("ignored-labels:v1").then(readIgnoredLabels),
  ]);
  const outcome = learnFromEvent(
    {
      ...message,
      now: new Date().toISOString(),
      profile,
    },
    { mappings, answers, conflicts, ignoredLabels },
  );

  if (outcome.kind === "mapping") {
    await storage.setItem("mappings:v1", {
      schemaVersion: STORAGE_SCHEMA_VERSION,
      value: outcome.state.mappings,
    });
  } else if (outcome.kind === "answer") {
    await storage.setItem("answers:v1", {
      schemaVersion: STORAGE_SCHEMA_VERSION,
      value: outcome.state.answers,
    });
  } else if (outcome.kind === "conflict") {
    await storage.setItem("conflicts:v1", {
      schemaVersion: STORAGE_SCHEMA_VERSION,
      value: outcome.state.conflicts,
    });
  }
  return { kind: outcome.kind };
}

async function getLearnedMappings(
  storage: StorageAdapter,
  host: string,
): Promise<{ mappings: Record<string, MatchingLearnedMapping> }> {
  const stored = await storage.getItem("mappings:v1");
  const mappings = readLearningCollection(stored, "mappings:v1", isLearnedMapping);
  const normalizedHost = host.toLowerCase();
  const result: Record<string, MatchingLearnedMapping> = {};

  for (const mapping of mappings) {
    if (mapping.host !== undefined && mapping.host.toLowerCase() !== normalizedHost) {
      continue;
    }

    const existing = result[mapping.labelNorm];
    if (!existing || mapping.host?.toLowerCase() === normalizedHost) {
      result[mapping.labelNorm] = {
        fieldKey: mapping.fieldKey,
        reviewed: mapping.reviewed,
        ...(mapping.host ? { host: mapping.host } : {}),
      };
    }
  }
  return { mappings: result };
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

async function handleRecordApplication(
  storage: StorageAdapter,
  message: Extract<RuntimeMessage, { type: "RECORD_APPLICATION" }>,
): Promise<{ duplicate: boolean }> {
  const stored = await storage.getItem("applications:v1");
  const records = readApplications(stored);
  const urlNorm = normalizeUrl(message.url);
  const candidate = {
    urlNorm,
    title: message.title,
    company: message.company,
  };

  const duplicate = isLikelyDuplicate(candidate, records);
  if (!duplicate) {
    const host = (() => {
      try {
        return new URL(message.url).hostname.toLowerCase().replace(/^www\./, "");
      } catch {
        return "";
      }
    })();

    records.push({
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      urlNorm,
      host,
      title: message.title,
      company: message.company,
      createdAt: new Date().toISOString(),
      status: message.status,
    });

    await storage.setItem("applications:v1", {
      schemaVersion: STORAGE_SCHEMA_VERSION,
      value: records,
    });
  }

  return { duplicate };
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
  providerFactory: AiProviderFactory = (apiKey) => new OpenRouterProvider({ apiKey }),
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
    if (message.type === "GET_MAPPINGS") {
      return getLearnedMappings(storage, message.host);
    }
    if (message.type === "LEARN_EVENT") {
      return handleLearningEvent(storage, message);
    }
    if (message.type === "RECORD_APPLICATION") {
      return handleRecordApplication(storage, message);
    }
    if (message.type === "AI_STATUS") {
      return getAiGenerationConfiguration(storage).then((configuration) => ({
        available: configuration !== undefined,
      }));
    }
  });
  registerAiGeneration(chromeApi, storage, providerFactory);
}

if (typeof chrome !== "undefined") {
  registerBackground(chrome);
}
