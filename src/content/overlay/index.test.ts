import { describe, expect, it, vi } from "vitest";
import { ptBr } from "../../shared/i18n/pt-br";
import type { RuntimeMessage } from "../../shared/messages";
import { mountOverlay } from "./index";

class FakeOverlayRuntime {
  constructor(
    private readonly response: { values: Record<string, string> } | { error: boolean } | Error,
    private readonly learnedMappings: Record<string, unknown> = {},
  ) {}

  readonly sendMessage = vi.fn(async (message: RuntimeMessage) => {
    if (this.response instanceof Error) {
      throw this.response;
    }

    if (message.type === "GET_MAPPINGS") {
      return { mappings: this.learnedMappings };
    }

    return this.response;
  });
}

function addField(labelText: string, type = "text"): HTMLInputElement {
  const label = document.createElement("label");
  const input = document.createElement("input");
  const id = `field-${document.querySelectorAll("input").length}`;
  label.htmlFor = id;
  label.textContent = labelText;
  input.id = id;
  input.type = type;
  input.style.width = "160px";
  input.style.height = "24px";
  document.body.append(label, input);
  return input;
}

describe("content overlay", () => {
  it("shows field counts, list actions, and a polite live region", async () => {
    document.body.replaceChildren();
    addField("E-mail", "email");
    addField("Campo personalizado");
    addField("Código OTP");
    const runtime = new FakeOverlayRuntime({ values: { email: "ana@example.test" } });
    const overlay = mountOverlay(document, runtime.sendMessage);

    await overlay.refresh();

    const root = document.getElementById("applyassist-overlay")?.shadowRoot;
    expect(root?.querySelector('[role="dialog"]')).not.toBeNull();
    expect(root?.querySelector('[aria-live="polite"]')).not.toBeNull();
    expect(root?.textContent).toContain("Prontos: 1");
    expect(root?.textContent).toContain("Abertas: 1");
    expect(root?.textContent).toContain("Bloqueados: 1");
    expect(root?.textContent).toContain("Preencher prontos");
    expect(root?.textContent).toContain("Desfazer");
    expect(root?.textContent).toContain("Aplicar");

    overlay.dispose();
  });

  it("renders a malicious page label as text, never as markup", async () => {
    document.body.replaceChildren();
    const maliciousLabel = '<img src=x onerror="alert(1)">';
    addField(maliciousLabel);
    addField(`Campo ${"x".repeat(250)}`);
    const runtime = new FakeOverlayRuntime({ values: {} });
    const overlay = mountOverlay(document, runtime.sendMessage);

    await overlay.refresh();

    const root = document.getElementById("applyassist-overlay")?.shadowRoot;
    expect(root?.querySelector("img")).toBeNull();
    expect(root?.textContent).toContain(maliciousLabel);
    expect(root?.querySelectorAll(".field-label").item(1)?.textContent?.length).toBe(161);

    overlay.dispose();
  });

  it("uses learned mappings as uncertain suggestions until they are reviewed", async () => {
    document.body.replaceChildren();
    addField("My custom field");
    const runtime = new FakeOverlayRuntime(
      { values: { city: "Recife" } },
      {
        "my custom field": {
          fieldKey: "city",
          reviewed: false,
          host: window.location.hostname,
        },
      },
    );
    const overlay = mountOverlay(document, runtime.sendMessage);

    await overlay.refresh();

    const root = document.getElementById("applyassist-overlay")?.shadowRoot;
    expect(root?.textContent).toContain("Incertos: 1");
    expect(root?.textContent).toContain("Recife");
    expect(runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: "GET_FILL_VALUES", fieldKeys: ["city"] }),
    );

    overlay.dispose();
  });

  it("applies a suggestion without clicking the page field and can undo it", async () => {
    document.body.replaceChildren();
    const input = addField("Nome completo");
    const pageClick = vi.fn();
    input.addEventListener("click", pageClick);
    const runtime = new FakeOverlayRuntime({ values: { fullName: "Ana Exemplo" } });
    const overlay = mountOverlay(document, runtime.sendMessage);

    await overlay.refresh();
    document
      .getElementById("applyassist-overlay")
      ?.shadowRoot?.querySelector<HTMLButtonElement>('[data-action="apply"]')
      ?.click();

    expect(input.value).toBe("Ana Exemplo");
    expect(pageClick).not.toHaveBeenCalled();

    document
      .getElementById("applyassist-overlay")
      ?.shadowRoot?.querySelector<HTMLButtonElement>('[data-action="undo"]')
      ?.click();

    expect(input.value).toBe("");
    overlay.dispose();
  });

  it("fills only ready empty fields when the batch action is used", async () => {
    document.body.replaceChildren();
    const emptyInput = addField("Pretensão salarial");
    const filledInput = addField("Cidade");
    filledInput.value = "Valor existente";
    const runtime = new FakeOverlayRuntime({
      values: { salaryExpectation: "R$ 10.000", city: "Recife" },
    });
    const overlay = mountOverlay(document, runtime.sendMessage);

    await overlay.refresh();
    document
      .getElementById("applyassist-overlay")
      ?.shadowRoot?.querySelector<HTMLButtonElement>('[data-action="apply-ready"]')
      ?.click();

    expect(emptyInput.value).toBe("R$ 10.000");
    expect(filledInput.value).toBe("Valor existente");

    overlay.dispose();
  });

  it("offers a focused-field chip with Alt+A and closes on Escape", async () => {
    document.body.replaceChildren();
    const input = addField("Cidade");
    const runtime = new FakeOverlayRuntime({ values: { city: "Recife" } });
    const onClose = vi.fn();
    const overlay = mountOverlay(document, runtime.sendMessage, onClose);

    await overlay.refresh();
    input.focus();

    const root = document.getElementById("applyassist-overlay")?.shadowRoot;
    expect(root?.querySelector('[data-action="chip"]')?.textContent).toContain("Recife");

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "a", altKey: true, bubbles: true }));
    expect(input.value).toBe("Recife");

    root?.querySelector<HTMLButtonElement>('[data-action="undo"]')?.click();
    input.focus();
    root?.querySelector<HTMLButtonElement>('[data-action="chip"]')?.click();
    expect(input.value).toBe("Recife");

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(document.getElementById("applyassist-overlay")).toBeNull();
    expect(onClose).toHaveBeenCalledTimes(1);
    overlay.dispose();
  });

  it("debounces rescans after page mutations and disconnects on disposal", async () => {
    document.body.replaceChildren();
    addField("E-mail", "email");
    const runtime = new FakeOverlayRuntime({ values: { email: "ana@example.test" } });
    const overlay = mountOverlay(document, runtime.sendMessage);

    await overlay.refresh();
    addField("Cidade");
    await vi.waitFor(() => {
      expect(runtime.sendMessage).toHaveBeenCalledTimes(4);
    });

    overlay.dispose();
    addField("Nome completo");
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(runtime.sendMessage).toHaveBeenCalledTimes(4);
  });

  it("announces a generic error when loading suggestions fails", async () => {
    document.body.replaceChildren();
    addField("E-mail", "email");
    const runtime = new FakeOverlayRuntime(new Error("private storage detail"));
    const overlay = mountOverlay(document, runtime.sendMessage);

    await overlay.refresh();

    const root = document.getElementById("applyassist-overlay")?.shadowRoot;
    expect(root?.textContent).toContain(ptBr.overlayLoadFailed);
    expect(root?.textContent).not.toContain("private storage detail");

    overlay.dispose();
  });
});
