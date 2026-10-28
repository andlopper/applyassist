import { render } from "preact";
import { useEffect, useState } from "preact/hooks";
import {
  isForbiddenField,
  isSensitiveFieldBlocked,
  sensitiveFieldCategories,
} from "../core/policy/forbidden";
import { FIELD_KEYS, type FieldKey } from "../core/matching/field-key";
import { normalizeLabel } from "../core/normalize";
import {
  type AnswerMemory,
  type LearnedMapping,
  type LearningConflict,
  type LearningState,
} from "../core/learning";
import { type Profile, parseProfileText, validateProfile } from "../core/profile";
import {
  DEFAULT_SETTINGS,
  normalizeSettings,
  type SensitiveCategory,
  type Settings,
} from "../shared/types";
import { ptBr } from "../shared/i18n/pt-br";

type OptionsLocalStorage = {
  get: (
    keys: string | string[] | Record<string, unknown> | null,
  ) => Promise<Record<string, unknown>>;
  set: (items: Record<string, unknown>) => Promise<void>;
  remove: (keys: string | string[]) => Promise<void>;
  clear: () => Promise<void>;
};

declare const chrome:
  | {
      storage?: {
        local?: OptionsLocalStorage;
      };
    }
  | undefined;

const PROFILE_STORAGE_KEY = "profile:v1";
const SETTINGS_STORAGE_KEY = "settings:v1";
const MAPPINGS_STORAGE_KEY = "mappings:v1";
const ANSWERS_STORAGE_KEY = "answers:v1";
const CONFLICTS_STORAGE_KEY = "conflicts:v1";
const IGNORED_LABELS_STORAGE_KEY = "ignored-labels:v1";
const EMPTY_LEARNING_STATE: LearningState = {
  mappings: [],
  answers: [],
  conflicts: [],
  ignoredLabels: [],
};
const PROFILE_FIELDS: FieldKey[] = [
  "fullName",
  "firstName",
  "lastName",
  "email",
  "phone",
  "city",
  "state",
  "country",
  "linkedinUrl",
  "githubUrl",
  "portfolioUrl",
  "currentRole",
  "currentCompany",
  "yearsExperience",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFieldKey(value: unknown): value is FieldKey {
  return typeof value === "string" && FIELD_KEYS.some((fieldKey) => fieldKey === value);
}

function isLearnedMapping(value: unknown): value is LearnedMapping {
  return (
    isRecord(value) &&
    typeof value.labelNorm === "string" &&
    isFieldKey(value.fieldKey) &&
    typeof value.reviewed === "boolean" &&
    typeof value.hits === "number" &&
    Number.isInteger(value.hits) &&
    typeof value.lastSeen === "string" &&
    (value.host === undefined || typeof value.host === "string") &&
    !isForbiddenField(value.labelNorm) &&
    !isSensitiveFieldBlocked(value.fieldKey)
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
    typeof value.createdAt === "string" &&
    !isForbiddenField(value.labelNorm)
  );
}

function isLearningConflict(value: unknown): value is LearningConflict {
  return (
    isRecord(value) &&
    isFieldKey(value.fieldKey) &&
    typeof value.stored === "string" &&
    typeof value.seen === "string" &&
    typeof value.host === "string" &&
    typeof value.createdAt === "string" &&
    !isSensitiveFieldBlocked(value.fieldKey)
  );
}

function readCollection<T>(value: unknown, key: string, isItem: (item: unknown) => item is T): T[] {
  if (value === undefined) {
    return [];
  }
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    !Array.isArray(value.value) ||
    !value.value.every(isItem)
  ) {
    throw new Error(`Invalid stored learning collection for ${key}.`);
  }
  return value.value;
}

function readIgnoredLabels(value: unknown): string[] {
  if (value === undefined) {
    return [];
  }
  if (!isRecord(value) || value.schemaVersion !== 1 || !isStringArray(value.value)) {
    throw new Error("Invalid stored ignored labels.");
  }
  return [...new Set(value.value.map(normalizeLabel).filter(Boolean))];
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((label: unknown) => typeof label === "string");
}

async function readStorageItem(key: string): Promise<unknown> {
  if (typeof chrome !== "undefined" && chrome.storage?.local) {
    const result = await chrome.storage.local.get(key);
    return Object.prototype.hasOwnProperty.call(result, key) ? result[key] : undefined;
  }
  throw new Error("chrome.storage.local is unavailable.");
}

async function writeStorageItems(items: Record<string, unknown>): Promise<void> {
  if (typeof chrome !== "undefined" && chrome.storage?.local) {
    await chrome.storage.local.set(items);
    return;
  }
  throw new Error("chrome.storage.local is unavailable.");
}

async function readProfile(stored: unknown): Promise<Profile> {
  if (stored === undefined) {
    return { values: {}, updatedAt: new Date().toISOString() };
  }
  if (
    !isRecord(stored) ||
    stored.schemaVersion !== 1 ||
    !isRecord(stored.value) ||
    !isRecord(stored.value.values) ||
    typeof stored.value.updatedAt !== "string"
  ) {
    throw new Error("Invalid stored profile.");
  }
  for (const [key, value] of Object.entries(stored.value.values)) {
    if (!isFieldKey(key) || typeof value !== "string") {
      throw new Error("Invalid stored profile field.");
    }
  }
  return validateProfile(stored.value);
}

async function readSettings(stored: unknown): Promise<Settings> {
  if (stored === undefined) {
    return DEFAULT_SETTINGS;
  }
  if (!isRecord(stored) || stored.schemaVersion !== 1 || !isRecord(stored.value)) {
    throw new Error("Invalid stored settings.");
  }
  return normalizeSettings(stored.value);
}

interface ExportData {
  schemaVersion: 1;
  profile: Profile;
  settings: Settings;
  learning: {
    mappings: LearnedMapping[];
    answers: AnswerMemory[];
    conflicts: LearningConflict[];
    ignoredLabels: string[];
  };
}

function parseProfile(value: unknown): Profile | undefined {
  if (!isRecord(value) || !isRecord(value.values) || typeof value.updatedAt !== "string") {
    return undefined;
  }
  for (const [key, fieldValue] of Object.entries(value.values)) {
    if (!isFieldKey(key) || typeof fieldValue !== "string") {
      return undefined;
    }
  }
  return validateProfile(value);
}

function parseSettings(value: unknown): Settings | undefined {
  if (
    !isRecord(value) ||
    (value.provider !== "none" && value.provider !== "openrouter" && value.provider !== "ollama") ||
    !isRecord(value.openrouter) ||
    (value.openrouter.model !== undefined && typeof value.openrouter.model !== "string") ||
    !isRecord(value.siteOverrides) ||
    typeof value.debug !== "boolean"
  ) {
    return undefined;
  }
  const sensitiveEnabled = value.sensitiveEnabled;
  if (
    !isRecord(sensitiveEnabled) ||
    !sensitiveFieldCategories.every((category) => typeof sensitiveEnabled[category] === "boolean")
  ) {
    return undefined;
  }
  for (const override of Object.values(value.siteOverrides)) {
    if (override !== "allow" && override !== "block") {
      return undefined;
    }
  }
  return normalizeSettings(value);
}

function parseExportData(raw: string): ExportData | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
  if (!isRecord(parsed) || parsed.schemaVersion !== 1 || !isRecord(parsed.learning)) {
    return undefined;
  }
  const profile = parseProfile(parsed.profile);
  const settings = parseSettings(parsed.settings);
  const { learning } = parsed;
  if (
    profile === undefined ||
    settings === undefined ||
    !Array.isArray(learning.mappings) ||
    !learning.mappings.every(isLearnedMapping) ||
    !Array.isArray(learning.answers) ||
    !learning.answers.every(isAnswerMemory) ||
    !Array.isArray(learning.conflicts) ||
    !learning.conflicts.every(isLearningConflict) ||
    !isStringArray(learning.ignoredLabels)
  ) {
    return undefined;
  }
  return {
    schemaVersion: 1,
    profile,
    settings,
    learning: {
      mappings: learning.mappings,
      answers: learning.answers,
      conflicts: learning.conflicts,
      ignoredLabels: [...new Set(learning.ignoredLabels.map(normalizeLabel).filter(Boolean))],
    },
  };
}

function normalizeProfile(values: Partial<Record<FieldKey, string>>): Profile {
  return validateProfile({ values, updatedAt: new Date().toISOString() });
}

export function OptionsApp() {
  const [profile, setProfile] = useState<Profile>({
    values: {},
    updatedAt: new Date().toISOString(),
  });
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [learning, setLearning] = useState<LearningState>(EMPTY_LEARNING_STATE);
  const [storageReady, setStorageReady] = useState(false);
  const [activeTab, setActiveTab] = useState<"profile" | "learning" | "data">("profile");
  const [selectedRecords, setSelectedRecords] = useState<string[]>([]);
  const [pasteText, setPasteText] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [exportUrl, setExportUrl] = useState("");

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const [
          storedProfile,
          storedSettings,
          storedMappings,
          storedAnswers,
          storedConflicts,
          storedIgnoredLabels,
        ] = await Promise.all([
          readStorageItem(PROFILE_STORAGE_KEY),
          readStorageItem(SETTINGS_STORAGE_KEY),
          readStorageItem(MAPPINGS_STORAGE_KEY),
          readStorageItem(ANSWERS_STORAGE_KEY),
          readStorageItem(CONFLICTS_STORAGE_KEY),
          readStorageItem(IGNORED_LABELS_STORAGE_KEY),
        ]);
        const [loadedProfile, loadedSettings] = await Promise.all([
          readProfile(storedProfile),
          readSettings(storedSettings),
        ]);
        const loadedLearning: LearningState = {
          mappings: readCollection(storedMappings, MAPPINGS_STORAGE_KEY, isLearnedMapping),
          answers: readCollection(storedAnswers, ANSWERS_STORAGE_KEY, isAnswerMemory),
          conflicts: readCollection(storedConflicts, CONFLICTS_STORAGE_KEY, isLearningConflict),
          ignoredLabels: readIgnoredLabels(storedIgnoredLabels),
        };
        if (active) {
          setProfile(loadedProfile);
          setSettings(loadedSettings);
          setLearning(loadedLearning);
          setStorageReady(true);
        }
      } catch {
        if (active) {
          setStatusMessage(ptBr.optionsStorageError);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (exportUrl) {
        URL.revokeObjectURL(exportUrl);
      }
    };
  }, [exportUrl]);

  const reviewEntries = Object.entries(profile.values).filter(
    (entry): entry is [FieldKey, string] =>
      typeof entry[1] === "string" && entry[1].trim().length > 0,
  );
  const hasLearningRecords =
    learning.mappings.length > 0 || learning.answers.length > 0 || learning.conflicts.length > 0;

  function updateProfileValue(fieldKey: FieldKey, value: string): void {
    setProfile((previous) => ({
      ...previous,
      values: { ...previous.values, [fieldKey]: value },
      updatedAt: new Date().toISOString(),
    }));
  }

  function updateSensitiveCategory(category: SensitiveCategory, enabled: boolean): void {
    setSettings((previous) => ({
      ...previous,
      sensitiveEnabled: {
        ...previous.sensitiveEnabled,
        [category]: enabled,
      },
    }));
  }

  function applyParsedProfile(raw: string): void {
    const parsed = parseProfileText(raw);
    setPasteText(raw);
    setProfile(parsed);
    setStatusMessage(ptBr.optionsReview);
  }

  async function handleSave(): Promise<void> {
    if (!storageReady) {
      setStatusMessage(ptBr.optionsStorageError);
      return;
    }
    const savedProfile = normalizeProfile(profile.values);
    const savedSettings = normalizeSettings(settings);
    try {
      await writeStorageItems({
        [PROFILE_STORAGE_KEY]: { schemaVersion: 1, value: savedProfile },
        [SETTINGS_STORAGE_KEY]: { schemaVersion: 1, value: savedSettings },
      });
      setStatusMessage(ptBr.optionsProfileSaved);
    } catch {
      setStatusMessage(ptBr.optionsStorageError);
    }
  }

  async function handleFileInput(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement | null;
    if (input === null) {
      return;
    }
    const file = input.files?.[0];
    if (file === undefined) {
      return;
    }
    try {
      applyParsedProfile(await file.text());
    } catch {
      setStatusMessage(ptBr.optionsImportInvalid);
    }
    input.value = "";
  }

  async function persistLearning(next: LearningState): Promise<boolean> {
    if (!storageReady) {
      setStatusMessage(ptBr.optionsStorageError);
      return false;
    }
    if (
      !next.mappings.every(isLearnedMapping) ||
      !next.answers.every(isAnswerMemory) ||
      !next.conflicts.every(isLearningConflict)
    ) {
      setStatusMessage(ptBr.optionsLearningInvalid);
      return false;
    }
    const normalized: LearningState & { ignoredLabels: string[] } = {
      mappings: next.mappings,
      answers: next.answers,
      conflicts: next.conflicts,
      ignoredLabels: [...(next.ignoredLabels ?? [])],
    };
    try {
      await writeStorageItems({
        [MAPPINGS_STORAGE_KEY]: { schemaVersion: 1, value: normalized.mappings },
        [ANSWERS_STORAGE_KEY]: { schemaVersion: 1, value: normalized.answers },
        [CONFLICTS_STORAGE_KEY]: { schemaVersion: 1, value: normalized.conflicts },
        [IGNORED_LABELS_STORAGE_KEY]: { schemaVersion: 1, value: normalized.ignoredLabels },
      });
      setLearning(normalized);
      setSelectedRecords([]);
      setStatusMessage(ptBr.optionsLearningSaved);
      return true;
    } catch {
      setStatusMessage(ptBr.optionsStorageError);
      return false;
    }
  }

  function updateMapping(index: number, patch: Partial<LearnedMapping>): void {
    setLearning((previous) => ({
      ...previous,
      mappings: previous.mappings.map((mapping, itemIndex) =>
        itemIndex === index ? { ...mapping, ...patch } : mapping,
      ),
    }));
  }

  function updateAnswer(index: number, patch: Partial<AnswerMemory>): void {
    setLearning((previous) => ({
      ...previous,
      answers: previous.answers.map((answer, itemIndex) =>
        itemIndex === index ? { ...answer, ...patch } : answer,
      ),
    }));
  }

  function selectionId(kind: "mapping" | "answer", index: number): string {
    return `${kind}:${index}`;
  }

  function toggleSelection(id: string, checked: boolean): void {
    setSelectedRecords((previous) =>
      checked ? [...new Set([...previous, id])] : previous.filter((selected) => selected !== id),
    );
  }

  async function approveSelected(): Promise<void> {
    const selected = new Set(selectedRecords);
    await persistLearning({
      ...learning,
      mappings: learning.mappings.map((mapping, index) =>
        selected.has(selectionId("mapping", index)) ? { ...mapping, reviewed: true } : mapping,
      ),
      answers: learning.answers.map((answer, index) =>
        selected.has(selectionId("answer", index)) ? { ...answer, reviewed: true } : answer,
      ),
    });
  }

  async function deleteSelected(): Promise<void> {
    const selected = new Set(selectedRecords);
    await persistLearning({
      ...learning,
      mappings: learning.mappings.filter(
        (_mapping, index) => !selected.has(selectionId("mapping", index)),
      ),
      answers: learning.answers.filter(
        (_answer, index) => !selected.has(selectionId("answer", index)),
      ),
    });
  }

  async function approveMapping(index: number): Promise<void> {
    await persistLearning({
      ...learning,
      mappings: learning.mappings.map((mapping, itemIndex) =>
        itemIndex === index ? { ...mapping, reviewed: true } : mapping,
      ),
    });
  }

  async function approveAnswer(index: number): Promise<void> {
    await persistLearning({
      ...learning,
      answers: learning.answers.map((answer, itemIndex) =>
        itemIndex === index ? { ...answer, reviewed: true } : answer,
      ),
    });
  }

  async function deleteMapping(index: number): Promise<void> {
    await persistLearning({
      ...learning,
      mappings: learning.mappings.filter((_mapping, itemIndex) => itemIndex !== index),
    });
  }

  async function deleteAnswer(index: number): Promise<void> {
    await persistLearning({
      ...learning,
      answers: learning.answers.filter((_answer, itemIndex) => itemIndex !== index),
    });
  }

  async function ignoreLabel(label: string): Promise<void> {
    const normalizedLabel = normalizeLabel(label);
    if (!normalizedLabel) {
      return;
    }
    await persistLearning({
      ...learning,
      mappings: learning.mappings.filter(
        (mapping) => normalizeLabel(mapping.labelNorm) !== normalizedLabel,
      ),
      answers: learning.answers.filter(
        (answer) => normalizeLabel(answer.labelNorm) !== normalizedLabel,
      ),
      ignoredLabels: [...new Set([...(learning.ignoredLabels ?? []), normalizedLabel])],
    });
  }

  async function resolveConflict(
    index: number,
    resolution: "keep" | "replace" | "job",
  ): Promise<void> {
    const conflict = learning.conflicts[index];
    if (conflict === undefined) {
      return;
    }
    const nextLearning: LearningState = {
      ...learning,
      conflicts: learning.conflicts.filter((_item, itemIndex) => itemIndex !== index),
      ...(resolution === "job"
        ? {
            answers: [
              ...learning.answers,
              {
                labelNorm: conflict.fieldKey,
                answer: conflict.seen,
                scope: "job" as const,
                host: conflict.host,
                reviewed: false,
                createdAt: conflict.createdAt,
              },
            ],
          }
        : {}),
    };
    const nextProfile =
      resolution === "replace"
        ? {
            ...profile,
            values: { ...profile.values, [conflict.fieldKey]: conflict.seen },
            updatedAt: new Date().toISOString(),
          }
        : profile;
    try {
      await writeStorageItems({
        [MAPPINGS_STORAGE_KEY]: { schemaVersion: 1, value: nextLearning.mappings },
        [ANSWERS_STORAGE_KEY]: { schemaVersion: 1, value: nextLearning.answers },
        [CONFLICTS_STORAGE_KEY]: { schemaVersion: 1, value: nextLearning.conflicts },
        [IGNORED_LABELS_STORAGE_KEY]: {
          schemaVersion: 1,
          value: [...(nextLearning.ignoredLabels ?? [])],
        },
        ...(resolution === "replace"
          ? {
              [PROFILE_STORAGE_KEY]: {
                schemaVersion: 1,
                value: nextProfile,
              },
            }
          : {}),
      });
      setLearning(nextLearning);
      if (resolution === "replace") {
        setProfile(nextProfile);
      }
      setStatusMessage(ptBr.optionsLearningSaved);
    } catch {
      setStatusMessage(ptBr.optionsStorageError);
    }
  }

  function handleExport(): void {
    if (!storageReady) {
      setStatusMessage(ptBr.optionsStorageError);
      return;
    }
    try {
      const data: ExportData = {
        schemaVersion: 1,
        profile,
        settings,
        learning: {
          mappings: learning.mappings,
          answers: learning.answers,
          conflicts: learning.conflicts,
          ignoredLabels: [...(learning.ignoredLabels ?? [])],
        },
      };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      setExportUrl(URL.createObjectURL(blob));
      setStatusMessage(ptBr.optionsDataExportReady);
    } catch {
      setStatusMessage(ptBr.optionsExportError);
    }
  }

  async function handleImport(event: Event): Promise<void> {
    if (!storageReady) {
      setStatusMessage(ptBr.optionsStorageError);
      return;
    }
    const input = event.target as HTMLInputElement | null;
    const file = input?.files?.[0];
    if (input === null || file === undefined) {
      return;
    }
    let imported: ExportData | undefined;
    try {
      imported = parseExportData(await file.text());
    } catch {
      imported = undefined;
    }
    input.value = "";
    if (imported === undefined) {
      setStatusMessage(ptBr.optionsImportInvalid);
      return;
    }
    const importedLearning: LearningState = {
      ...imported.learning,
    };
    try {
      await writeStorageItems({
        [PROFILE_STORAGE_KEY]: { schemaVersion: 1, value: imported.profile },
        [SETTINGS_STORAGE_KEY]: { schemaVersion: 1, value: imported.settings },
        [MAPPINGS_STORAGE_KEY]: { schemaVersion: 1, value: importedLearning.mappings },
        [ANSWERS_STORAGE_KEY]: { schemaVersion: 1, value: importedLearning.answers },
        [CONFLICTS_STORAGE_KEY]: { schemaVersion: 1, value: importedLearning.conflicts },
        [IGNORED_LABELS_STORAGE_KEY]: { schemaVersion: 1, value: importedLearning.ignoredLabels },
      });
      setProfile(imported.profile);
      setSettings(imported.settings);
      setLearning(importedLearning);
      setPasteText("");
      setStorageReady(true);
      setStatusMessage(ptBr.optionsDataImported);
    } catch {
      setStatusMessage(ptBr.optionsStorageError);
    }
  }

  async function handleDeleteAll(): Promise<void> {
    if (!storageReady) {
      setStatusMessage(ptBr.optionsStorageError);
      return;
    }
    if (!window.confirm(ptBr.optionsDataDeleteConfirm)) {
      return;
    }
    try {
      if (typeof chrome === "undefined" || chrome.storage?.local === undefined) {
        throw new Error("chrome.storage.local is unavailable.");
      }
      await chrome.storage.local.clear();
      setProfile({ values: {}, updatedAt: new Date().toISOString() });
      setSettings(DEFAULT_SETTINGS);
      setLearning(EMPTY_LEARNING_STATE);
      setSelectedRecords([]);
      setPasteText("");
      setExportUrl("");
      setStorageReady(true);
      setStatusMessage(ptBr.optionsDataDeleted);
    } catch {
      setStatusMessage(ptBr.optionsStorageError);
    }
  }

  return (
    <main>
      <h1>{ptBr.optionsTitle}</h1>
      <p>{ptBr.optionsWelcome}</p>
      <nav aria-label={ptBr.optionsNavigationLabel}>
        <button
          type="button"
          aria-current={activeTab === "profile" ? "page" : undefined}
          onClick={() => setActiveTab("profile")}
        >
          {ptBr.optionsTabProfile}
        </button>
        <button
          type="button"
          aria-current={activeTab === "learning" ? "page" : undefined}
          onClick={() => setActiveTab("learning")}
        >
          {ptBr.optionsTabLearning}
        </button>
        <button
          type="button"
          aria-current={activeTab === "data" ? "page" : undefined}
          onClick={() => setActiveTab("data")}
        >
          {ptBr.optionsTabData}
        </button>
      </nav>

      {activeTab === "profile" ? (
        <>
          <section>
            <h2>{ptBr.optionsPasteText}</h2>
            <textarea
              aria-label={ptBr.optionsPasteText}
              rows={8}
              value={pasteText}
              onInput={(event) => {
                const target = event.currentTarget as HTMLTextAreaElement;
                applyParsedProfile(target.value);
              }}
            />
            <label>
              {ptBr.optionsUploadFile}
              <input
                type="file"
                accept=".txt,.md,.json,text/plain,application/json"
                onChange={(event) => void handleFileInput(event)}
              />
            </label>
          </section>

          <section>
            <h2>{ptBr.optionsManualForm}</h2>
            <div>
              {PROFILE_FIELDS.map((field) => (
                <label key={field}>
                  {ptBr.optionsFieldLabels[field]}
                  <input
                    type="text"
                    value={profile.values[field] ?? ""}
                    onInput={(event) => {
                      const target = event.currentTarget as HTMLInputElement;
                      updateProfileValue(field, target.value);
                    }}
                  />
                </label>
              ))}
            </div>
          </section>

          <section>
            <h2>{ptBr.optionsReview}</h2>
            <ul>
              {reviewEntries.map(([key, value]) => (
                <li key={key}>
                  <strong>{ptBr.optionsFieldLabels[key]}</strong>: {value}
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h2>{ptBr.optionsAiDisabled}</h2>
            <p>{ptBr.optionsAiHint}</p>
            {sensitiveFieldCategories.map((category) => (
              <label key={category}>
                <input
                  type="checkbox"
                  checked={settings.sensitiveEnabled[category] ?? false}
                  onChange={(event) => {
                    const target = event.currentTarget as HTMLInputElement;
                    updateSensitiveCategory(category, target.checked);
                  }}
                />
                {ptBr[
                  `optionsCategory${category.charAt(0).toUpperCase() + category.slice(1)}` as keyof typeof ptBr
                ] ?? category}
              </label>
            ))}
          </section>

          <button type="button" disabled={!storageReady} onClick={() => void handleSave()}>
            {ptBr.optionsSave}
          </button>
        </>
      ) : null}

      {activeTab === "learning" ? (
        <section>
          <h2>{ptBr.optionsLearningTitle}</h2>
          {!hasLearningRecords ? <p>{ptBr.optionsLearningEmpty}</p> : null}
          {learning.mappings.length > 0 || learning.answers.length > 0 ? (
            <>
              <button
                type="button"
                disabled={selectedRecords.length === 0}
                onClick={() => void approveSelected()}
              >
                {ptBr.optionsLearningApproveSelected}
              </button>
              <button
                type="button"
                disabled={selectedRecords.length === 0}
                onClick={() => void deleteSelected()}
              >
                {ptBr.optionsLearningDeleteSelected}
              </button>
            </>
          ) : null}
          {learning.mappings.length > 0 ? (
            <section>
              <h3>{ptBr.optionsLearningMappings}</h3>
              <table>
                <thead>
                  <tr>
                    <th>{ptBr.optionsLearningSelectLabel}</th>
                    <th>{ptBr.optionsLearningLabel}</th>
                    <th>{ptBr.optionsLearningField}</th>
                    <th>{ptBr.optionsLearningStatus}</th>
                    <th>{ptBr.optionsLearningHost}</th>
                    <th>{ptBr.optionsLearningActions}</th>
                  </tr>
                </thead>
                <tbody>
                  {learning.mappings.map((mapping, index) => (
                    <tr key={`mapping-${mapping.labelNorm}-${index}`}>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`${ptBr.optionsLearningSelectLabel} ${mapping.labelNorm}`}
                          checked={selectedRecords.includes(selectionId("mapping", index))}
                          onChange={(event) =>
                            toggleSelection(
                              selectionId("mapping", index),
                              event.currentTarget.checked,
                            )
                          }
                        />
                      </td>
                      <td>
                        <input
                          aria-label={`${ptBr.optionsLearningEditLabel} ${mapping.labelNorm}`}
                          value={mapping.labelNorm}
                          onInput={(event) =>
                            updateMapping(index, {
                              labelNorm: (event.currentTarget as HTMLInputElement).value,
                            })
                          }
                        />
                      </td>
                      <td>
                        <select
                          aria-label={`${ptBr.optionsLearningEditField} ${mapping.labelNorm}`}
                          value={mapping.fieldKey}
                          onChange={(event) =>
                            updateMapping(index, {
                              fieldKey: (event.currentTarget as HTMLSelectElement)
                                .value as FieldKey,
                            })
                          }
                        >
                          {FIELD_KEYS.filter((fieldKey) => !isSensitiveFieldBlocked(fieldKey)).map(
                            (fieldKey) => (
                              <option key={fieldKey} value={fieldKey}>
                                {ptBr.optionsFieldLabels[fieldKey]}
                              </option>
                            ),
                          )}
                        </select>
                      </td>
                      <td>
                        {mapping.reviewed
                          ? ptBr.optionsLearningReviewed
                          : ptBr.optionsLearningPending}
                      </td>
                      <td>{mapping.host ?? ""}</td>
                      <td>
                        <button type="button" onClick={() => void approveMapping(index)}>
                          {ptBr.optionsLearningApprove}
                        </button>
                        <button type="button" onClick={() => void deleteMapping(index)}>
                          {ptBr.optionsLearningDelete}
                        </button>
                        <button type="button" onClick={() => void ignoreLabel(mapping.labelNorm)}>
                          {ptBr.optionsLearningIgnoreLabel}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ) : null}
          {learning.answers.length > 0 ? (
            <section>
              <h3>{ptBr.optionsLearningAnswers}</h3>
              <table>
                <thead>
                  <tr>
                    <th>{ptBr.optionsLearningSelectLabel}</th>
                    <th>{ptBr.optionsLearningLabel}</th>
                    <th>{ptBr.optionsLearningAnswer}</th>
                    <th>{ptBr.optionsLearningStatus}</th>
                    <th>{ptBr.optionsLearningHost}</th>
                    <th>{ptBr.optionsLearningActions}</th>
                  </tr>
                </thead>
                <tbody>
                  {learning.answers.map((answer, index) => (
                    <tr key={`answer-${answer.labelNorm}-${index}`}>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`${ptBr.optionsLearningSelectLabel} ${answer.labelNorm}`}
                          checked={selectedRecords.includes(selectionId("answer", index))}
                          onChange={(event) =>
                            toggleSelection(
                              selectionId("answer", index),
                              event.currentTarget.checked,
                            )
                          }
                        />
                      </td>
                      <td>
                        <input
                          aria-label={`${ptBr.optionsLearningEditLabel} ${answer.labelNorm}`}
                          value={answer.labelNorm}
                          onInput={(event) =>
                            updateAnswer(index, {
                              labelNorm: (event.currentTarget as HTMLInputElement).value,
                            })
                          }
                        />
                      </td>
                      <td>
                        <textarea
                          aria-label={`${ptBr.optionsLearningEditAnswer} ${answer.labelNorm}`}
                          value={answer.answer}
                          onInput={(event) =>
                            updateAnswer(index, {
                              answer: (event.currentTarget as HTMLTextAreaElement).value,
                            })
                          }
                        />
                      </td>
                      <td>
                        {answer.reviewed
                          ? ptBr.optionsLearningReviewed
                          : ptBr.optionsLearningPending}
                      </td>
                      <td>{answer.host}</td>
                      <td>
                        <button type="button" onClick={() => void approveAnswer(index)}>
                          {ptBr.optionsLearningApprove}
                        </button>
                        <button type="button" onClick={() => void deleteAnswer(index)}>
                          {ptBr.optionsLearningDelete}
                        </button>
                        <button type="button" onClick={() => void ignoreLabel(answer.labelNorm)}>
                          {ptBr.optionsLearningIgnoreLabel}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ) : null}
          {learning.mappings.length + learning.answers.length > 0 ? (
            <button
              type="button"
              disabled={!storageReady}
              onClick={() => void persistLearning(learning)}
            >
              {ptBr.optionsLearningSave}
            </button>
          ) : null}
          {learning.conflicts.length > 0 ? (
            <section>
              <h3>{ptBr.optionsLearningConflicts}</h3>
              {learning.conflicts.map((conflict, index) => (
                <article key={`${conflict.fieldKey}-${conflict.host}-${conflict.createdAt}`}>
                  <h4>{ptBr.optionsFieldLabels[conflict.fieldKey]}</h4>
                  <p>{`${ptBr.optionsLearningHost}: ${conflict.host}`}</p>
                  <p>{`${ptBr.optionsLearningField}: ${conflict.stored}`}</p>
                  <p>{`${ptBr.optionsLearningAnswer}: ${conflict.seen}`}</p>
                  <button type="button" onClick={() => void resolveConflict(index, "keep")}>
                    {ptBr.optionsLearningKeepProfile}
                  </button>
                  <button type="button" onClick={() => void resolveConflict(index, "replace")}>
                    {ptBr.optionsLearningReplaceProfile}
                  </button>
                  <button type="button" onClick={() => void resolveConflict(index, "job")}>
                    {ptBr.optionsLearningOnlyJob}
                  </button>
                  <p>{ptBr.optionsLearningJobScopeNote}</p>
                </article>
              ))}
            </section>
          ) : null}
        </section>
      ) : null}

      {activeTab === "data" ? (
        <section>
          <h2>{ptBr.optionsDataTitle}</h2>
          <p>{ptBr.optionsDataHint}</p>
          <button type="button" disabled={!storageReady} onClick={handleExport}>
            {ptBr.optionsDataExport}
          </button>
          {exportUrl ? (
            <p>
              <a href={exportUrl} download="applyassist-data.json">
                {ptBr.optionsDataDownload}
              </a>
            </p>
          ) : null}
          <label>
            {ptBr.optionsDataImport}
            <input
              type="file"
              aria-label={ptBr.optionsDataImport}
              accept=".json,application/json"
              disabled={!storageReady}
              onChange={(event) => void handleImport(event)}
            />
          </label>
          <button type="button" disabled={!storageReady} onClick={() => void handleDeleteAll()}>
            {ptBr.optionsDataDelete}
          </button>
        </section>
      ) : null}

      {statusMessage ? <p aria-live="polite">{statusMessage}</p> : null}
    </main>
  );
}

export function renderOptionsPage(
  target: Element | DocumentFragment = document.getElementById("app") ?? document.body,
): void {
  render(<OptionsApp />, target);
}

if (typeof document !== "undefined" && document.getElementById("app")) {
  renderOptionsPage();
}
