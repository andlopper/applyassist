import { render } from "preact";
import { useState } from "preact/hooks";
import { sensitiveFieldCategories } from "../core/policy/forbidden";
import { type Profile, parseProfileText, validateProfile } from "../core/profile";
import { DEFAULT_SETTINGS, normalizeSettings, type SensitiveCategory, type Settings } from "../shared/types";
import { ptBr } from "../shared/i18n/pt-br";

declare const chrome:
  | {
      storage?: {
        local?: {
          get: (keys: string | string[] | Record<string, unknown>) => Promise<Record<string, unknown>>;
          set: (items: Record<string, unknown>) => Promise<void>;
          remove: (keys: string | string[]) => Promise<void>;
          clear: () => Promise<void>;
        };
      };
    }
  | undefined;

const PROFILE_STORAGE_KEY = "profile:v1";
const SETTINGS_STORAGE_KEY = "settings:v1";
const PROFILE_FIELDS: Array<{ key: string; label: string }> = [
  { key: "fullName", label: "Nome completo" },
  { key: "firstName", label: "Nome" },
  { key: "lastName", label: "Sobrenome" },
  { key: "email", label: "E-mail" },
  { key: "phone", label: "Telefone" },
  { key: "city", label: "Cidade" },
  { key: "state", label: "Estado" },
  { key: "country", label: "País" },
  { key: "linkedinUrl", label: "LinkedIn" },
  { key: "githubUrl", label: "GitHub" },
  { key: "portfolioUrl", label: "Portfólio" },
  { key: "currentRole", label: "Cargo atual" },
  { key: "currentCompany", label: "Empresa atual" },
  { key: "yearsExperience", label: "Experiência" },
];

async function writeStorageItem(key: string, value: unknown): Promise<void> {
  if (typeof chrome !== "undefined" && chrome.storage?.local) {
    await chrome.storage.local.set({ [key]: value });
    return;
  }

  window.localStorage.setItem(key, JSON.stringify(value));
}

function normalizeProfile(values: Partial<Record<string, string>>): Profile {
  return validateProfile({ values, updatedAt: new Date().toISOString() });
}

export function OptionsApp() {
  const [profile, setProfile] = useState<Profile>({ values: {}, updatedAt: new Date().toISOString() });
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [pasteText, setPasteText] = useState("");
  const [statusMessage, setStatusMessage] = useState("");

  const reviewEntries = Object.entries(profile.values).filter(
    (entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].trim().length > 0,
  );

  function updateProfileValue(fieldKey: string, value: string): void {
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
    const savedProfile = normalizeProfile(profile.values);
    const savedSettings = normalizeSettings(settings);

    await writeStorageItem(PROFILE_STORAGE_KEY, { schemaVersion: 1, value: savedProfile });
    await writeStorageItem(SETTINGS_STORAGE_KEY, { schemaVersion: 1, value: savedSettings });
    setStatusMessage("Perfil salvo.");
  }

  async function handleFileInput(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement | null;
    if (input == null) {
      return;
    }

    const file = input.files?.[0];
    if (file == null) {
      return;
    }

    const raw = await file.text();
    applyParsedProfile(raw);
    input.value = "";
  }

  return (
    <main>
      <h1>{ptBr.optionsTitle}</h1>
      <p>{ptBr.optionsWelcome}</p>

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
          <input type="file" accept=".txt,.md,.json,text/plain,application/json" onChange={(event) => void handleFileInput(event)} />
        </label>
      </section>

      <section>
        <h2>{ptBr.optionsManualForm}</h2>
        <div>
          {PROFILE_FIELDS.map((field) => (
            <label key={field.key}>
              {field.label}
              <input
                type="text"
                value={profile.values[field.key as keyof typeof profile.values] ?? ""}
                onInput={(event) => {
                  const target = event.currentTarget as HTMLInputElement;
                  updateProfileValue(field.key, target.value);
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
              <strong>{key}</strong>: {value}
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
            {ptBr[`optionsCategory${category.charAt(0).toUpperCase() + category.slice(1)}` as keyof typeof ptBr] ?? category}
          </label>
        ))}
      </section>

      <button type="button" onClick={() => void handleSave()}>
        {ptBr.optionsSave}
      </button>
      {statusMessage ? <p aria-live="polite">{statusMessage}</p> : null}
    </main>
  );
}

export function renderOptionsPage(target: Element | DocumentFragment = document.getElementById("app") ?? document.body): void {
  render(<OptionsApp />, target);
}

if (typeof document !== "undefined" && document.getElementById("app")) {
  renderOptionsPage();
}
