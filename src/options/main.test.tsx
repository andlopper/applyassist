import { render } from "preact";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { OptionsApp } from "./main";

describe("options onboarding", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    window.localStorage.clear();
    const storage = new Map<string, unknown>();
    (globalThis as typeof globalThis & { chrome?: { storage?: { local?: { get: (key: string) => Promise<Record<string, unknown>>; set: (items: Record<string, unknown>) => Promise<void>; } } } }).chrome = {
      storage: {
        local: {
          async get(key: string) {
            const result = storage.has(key) ? { [key]: storage.get(key) } : {};
            return result;
          },
          async set(items: Record<string, unknown>) {
            for (const [key, value] of Object.entries(items)) {
              storage.set(key, value);
            }
          },
        },
      },
    };
  });

  afterEach(() => {
    delete (globalThis as typeof globalThis & { chrome?: unknown }).chrome;
  });

  it("renders onboarding form and saves profile data after review", async () => {
    render(<OptionsApp />, document.body);
    await new Promise((resolve) => setTimeout(resolve, 0));

    const textarea = document.querySelector("textarea") as HTMLTextAreaElement;
    textarea.value = "Nome: Ana Silva\nE-mail: ana@exemplo.com\nTelefone: +55 11 99999-9999";
    textarea.dispatchEvent(new Event("input", { bubbles: true }));

    const checkbox = Array.from(document.querySelectorAll("input[type='checkbox']")).find((input) =>
      input.parentElement?.textContent?.includes("Documentos"),
    ) as HTMLInputElement;
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event("change", { bubbles: true }));

    const button = Array.from(document.querySelectorAll("button")).find((element) =>
      element.textContent?.includes("Salvar perfil"),
    ) as HTMLButtonElement;
    button.click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(document.body.textContent).toContain("Perfil salvo.");
    expect(document.body.textContent).toContain("Ana Silva");
  });

});
