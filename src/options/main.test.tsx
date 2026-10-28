import { render } from "preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OptionsApp } from "./main";

type OptionsLocalStorage = {
  get: (
    keys: string | string[] | Record<string, unknown> | null,
  ) => Promise<Record<string, unknown>>;
  set: (items: Record<string, unknown>) => Promise<void>;
  remove: (keys: string | string[]) => Promise<void>;
  clear: () => Promise<void>;
};

class FakeOptionsStorage {
  readonly values = new Map<string, unknown>();
  readonly local: OptionsLocalStorage = {
    get: async (keys) => {
      if (keys === null) {
        return Object.fromEntries(this.values);
      }
      const requested =
        typeof keys === "string" ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys);
      return Object.fromEntries(
        requested.flatMap((key) => (this.values.has(key) ? [[key, this.values.get(key)]] : [])),
      );
    },
    set: async (items) => {
      for (const [key, value] of Object.entries(items)) {
        this.values.set(key, value);
      }
    },
    remove: async (keys) => {
      for (const key of typeof keys === "string" ? [keys] : keys) {
        this.values.delete(key);
      }
    },
    clear: async () => {
      this.values.clear();
    },
  };
}

let storage: FakeOptionsStorage;

function setChromeStorage(fakeStorage: FakeOptionsStorage): void {
  (
    globalThis as typeof globalThis & {
      chrome?: { storage?: { local?: OptionsLocalStorage } };
    }
  ).chrome = { storage: { local: fakeStorage.local } };
}

function buttonByName(name: string): HTMLButtonElement {
  const button = Array.from(document.querySelectorAll("button")).find((element) =>
    element.textContent?.trim().includes(name),
  );
  if (button === undefined) {
    const availableButtons = Array.from(document.querySelectorAll("button"))
      .map((element) => element.textContent?.trim() ?? "")
      .join(", ");
    throw new Error(`Expected button "${name}". Available: ${availableButtons}`);
  }
  return button as HTMLButtonElement;
}

async function flushUi(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("R-08/R-10 options onboarding and learning review", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    window.localStorage.clear();
    storage = new FakeOptionsStorage();
    setChromeStorage(storage);
  });

  afterEach(() => {
    render(null, document.body);
    delete (globalThis as typeof globalThis & { chrome?: unknown }).chrome;
    vi.restoreAllMocks();
  });

  it("renders onboarding form and saves profile data after review", async () => {
    render(<OptionsApp />, document.body);
    await flushUi();
    await flushUi();

    const textarea = document.querySelector("textarea") as HTMLTextAreaElement;
    textarea.value = "Nome: Ana Silva\nE-mail: ana@exemplo.com\nTelefone: +55 11 99999-9999";
    textarea.dispatchEvent(new Event("input", { bubbles: true }));

    const checkbox = Array.from(document.querySelectorAll("input[type='checkbox']")).find((input) =>
      input.parentElement?.textContent?.includes("Documentos"),
    ) as HTMLInputElement;
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event("change", { bubbles: true }));

    buttonByName("Salvar perfil").click();
    await flushUi();

    expect(document.body.textContent).toContain("Perfil salvo.");
    expect(document.body.textContent).toContain("Ana Silva");
  });

  it("does not fall back to browser localStorage when extension storage is unavailable", async () => {
    delete (globalThis as typeof globalThis & { chrome?: unknown }).chrome;
    window.localStorage.setItem("profile:v1", "must-not-be-read");
    render(<OptionsApp />, document.body);
    await flushUi();
    await flushUi();

    expect(document.body.textContent).toContain("Não foi possível acessar os dados locais");
    expect(buttonByName("Salvar perfil").disabled).toBe(true);
    expect(window.localStorage.getItem("profile:v1")).toBe("must-not-be-read");
  });

  it("reviews learned mappings and resolves conflicts without overwriting by default", async () => {
    await storage.local.set({
      "mappings:v1": {
        schemaVersion: 1,
        value: [
          {
            labelNorm: "preferred city",
            fieldKey: "city",
            reviewed: false,
            hits: 2,
            lastSeen: "2026-01-01T00:00:00.000Z",
            host: "example.org",
          },
        ],
      },
      "conflicts:v1": {
        schemaVersion: 1,
        value: [
          {
            fieldKey: "email",
            stored: "ada@example.test",
            seen: "new@example.test",
            host: "example.org",
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      },
      "profile:v1": {
        schemaVersion: 1,
        value: { values: { email: "ada@example.test" }, updatedAt: "2026-01-01T00:00:00.000Z" },
      },
    });
    render(<OptionsApp />, document.body);
    await flushUi();
    buttonByName("Aprendizado").click();
    await flushUi();

    const mappingLabel = document.querySelector(
      "input[aria-label='Editar rótulo preferred city']",
    ) as HTMLInputElement;
    expect(mappingLabel.value).toBe("preferred city");
    expect(document.body.textContent).toContain("Pendente");

    buttonByName("Não aprender este rótulo").click();
    await flushUi();
    buttonByName("Manter valor do perfil").click();
    await flushUi();

    expect(storage.values.get("ignored-labels:v1")).toEqual({
      schemaVersion: 1,
      value: ["preferred city"],
    });
    expect(storage.values.get("conflicts:v1")).toEqual({ schemaVersion: 1, value: [] });
    expect(storage.values.get("profile:v1")).toMatchObject({
      value: { values: { email: "ada@example.test" } },
    });
  });

  it("lets a user approve selected learning records as a batch", async () => {
    await storage.local.set({
      "mappings:v1": {
        schemaVersion: 1,
        value: [
          {
            labelNorm: "preferred city",
            fieldKey: "city",
            reviewed: false,
            hits: 1,
            lastSeen: "2026-01-01T00:00:00.000Z",
          },
        ],
      },
    });
    render(<OptionsApp />, document.body);
    await flushUi();
    buttonByName("Aprendizado").click();
    await flushUi();

    const selection = document.querySelector(
      "input[aria-label='Selecionar preferred city']",
    ) as HTMLInputElement;
    selection.click();
    await flushUi();
    buttonByName("Aprovar selecionados").click();
    await flushUi();

    expect(storage.values.get("mappings:v1")).toMatchObject({
      value: [{ labelNorm: "preferred city", reviewed: true }],
    });
    const selectionAfterApproval = document.querySelector(
      "input[aria-label='Selecionar preferred city']",
    ) as HTMLInputElement;
    selectionAfterApproval.click();
    await flushUi();
    buttonByName("Excluir selecionados").click();
    await flushUi();
    expect(storage.values.get("mappings:v1")).toEqual({ schemaVersion: 1, value: [] });
  });

  it("saves mapping edits and replaces the profile value when resolving a conflict", async () => {
    await storage.local.set({
      "mappings:v1": {
        schemaVersion: 1,
        value: [
          {
            labelNorm: "preferred city",
            fieldKey: "city",
            reviewed: false,
            hits: 1,
            lastSeen: "2026-01-01T00:00:00.000Z",
          },
        ],
      },
      "conflicts:v1": {
        schemaVersion: 1,
        value: [
          {
            fieldKey: "email",
            stored: "ada@example.test",
            seen: "new@example.test",
            host: "example.org",
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      },
      "profile:v1": {
        schemaVersion: 1,
        value: { values: { email: "ada@example.test" }, updatedAt: "2026-01-01T00:00:00.000Z" },
      },
    });
    render(<OptionsApp />, document.body);
    await flushUi();
    buttonByName("Aprendizado").click();
    await flushUi();

    const labelInput = document.querySelector(
      "input[aria-label='Editar rótulo preferred city']",
    ) as HTMLInputElement;
    labelInput.value = "cidade preferida";
    labelInput.dispatchEvent(new Event("input", { bubbles: true }));
    await flushUi();
    buttonByName("Salvar alterações").click();
    await flushUi();
    buttonByName("Substituir pelo valor visto").click();
    await flushUi();

    expect(storage.values.get("mappings:v1")).toMatchObject({
      value: [{ labelNorm: "cidade preferida", reviewed: false }],
    });
    expect(storage.values.get("profile:v1")).toMatchObject({
      value: { values: { email: "new@example.test" } },
    });
    expect(storage.values.get("conflicts:v1")).toEqual({ schemaVersion: 1, value: [] });
  });

  it("validates an imported JSON backup before writing local data", async () => {
    storage.values.set("secrets:v1", { apiKey: "preserve-secret" });
    render(<OptionsApp />, document.body);
    await flushUi();
    buttonByName("Dados").click();
    await flushUi();

    const input = document.querySelector(
      "input[aria-label='Importar JSON']",
    ) as HTMLInputElement | null;
    if (input === null) {
      throw new Error("Missing JSON import input.");
    }
    const invalidFile = new File(["{}"], "invalid.json", { type: "application/json" });
    Object.defineProperty(input, "files", { configurable: true, value: [invalidFile] });
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await flushUi();
    expect(document.body.textContent).toContain("O arquivo não é um JSON válido");
    expect(storage.values.get("secrets:v1")).toEqual({ apiKey: "preserve-secret" });

    const validBackup = {
      schemaVersion: 1,
      profile: { values: { city: "Recife" }, updatedAt: "2026-01-01T00:00:00.000Z" },
      settings: {
        sensitiveEnabled: { documents: false, birth: false, address: false, diversity: false },
        provider: "none",
        openrouter: {},
        siteOverrides: {},
        debug: false,
      },
      learning: { mappings: [], answers: [], conflicts: [], ignoredLabels: [] },
    };
    const validFile = new File([JSON.stringify(validBackup)], "backup.json", {
      type: "application/json",
    });
    Object.defineProperty(input, "files", { configurable: true, value: [validFile] });
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await flushUi();

    expect(storage.values.get("profile:v1")).toMatchObject({
      value: { values: { city: "Recife" } },
    });
    expect(storage.values.get("secrets:v1")).toEqual({ apiKey: "preserve-secret" });
  });

  it("keeps a conflict answer in job scope without inventing a job key", async () => {
    await storage.local.set({
      "conflicts:v1": {
        schemaVersion: 1,
        value: [
          {
            fieldKey: "city",
            stored: "Recife",
            seen: "Lisbon",
            host: "example.org",
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      },
    });
    render(<OptionsApp />, document.body);
    await flushUi();
    buttonByName("Aprendizado").click();
    await flushUi();
    buttonByName("Guardar só para esta vaga").click();
    await flushUi();

    expect(storage.values.get("answers:v1")).toEqual({
      schemaVersion: 1,
      value: [
        {
          labelNorm: "city",
          answer: "Lisbon",
          scope: "job",
          host: "example.org",
          reviewed: false,
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    });
    expect(storage.values.get("conflicts:v1")).toEqual({ schemaVersion: 1, value: [] });
  });

  it("exports learning data and asks before deleting local data", async () => {
    await storage.local.set({
      "mappings:v1": { schemaVersion: 1, value: [] },
      "secrets:v1": { apiKey: "never-export-this" },
    });
    render(<OptionsApp />, document.body);
    await flushUi();
    buttonByName("Dados").click();
    await flushUi();
    const createObjectURL = vi.spyOn(URL, "createObjectURL");
    buttonByName("Exportar JSON").click();
    await flushUi();

    const exportLink = document.querySelector(
      "a[download='applyassist-data.json']",
    ) as HTMLAnchorElement;
    expect(exportLink.href).toContain("blob:");
    expect(exportLink.textContent).toContain("Baixar exportação");
    const exportedBlob = createObjectURL.mock.calls[0]?.[0];
    expect(exportedBlob).toBeInstanceOf(Blob);
    if (!(exportedBlob instanceof Blob)) {
      throw new Error("Export did not create a JSON blob.");
    }
    expect(await exportedBlob.text()).not.toContain("never-export-this");

    const confirm = vi.fn().mockReturnValue(false);
    Object.defineProperty(window, "confirm", { configurable: true, value: confirm });
    buttonByName("Apagar tudo").click();
    expect(confirm).toHaveBeenCalled();
    expect(storage.values.has("mappings:v1")).toBe(true);

    confirm.mockReturnValue(true);
    buttonByName("Apagar tudo").click();
    await flushUi();
    expect(storage.values.size).toBe(0);
    Reflect.deleteProperty(window, "confirm");
  });
});
