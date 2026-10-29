import { describe, expect, it, vi } from "vitest";
import { ptBr } from "../../shared/i18n/pt-br";
import type { AiGenerationCommand, RuntimeMessage } from "../../shared/messages";
import { AiGenerationError, type AiGenerator } from "../ai";
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
    if (message.type === "AI_STATUS") {
      return { available: true };
    }

    return this.response;
  });
}

class FakeAiGenerator {
  readonly requests: AiGenerationCommand[] = [];

  constructor(
    private readonly chunks: readonly string[],
    private readonly error?: Error,
  ) {}

  readonly generate: AiGenerator = async (command, signal, onChunk) => {
    this.requests.push(command);
    for (const chunk of this.chunks) {
      onChunk(chunk);
    }
    if (this.error) {
      throw this.error;
    }
    if (signal.aborted) {
      throw new DOMException("The operation was aborted.", "AbortError");
    }
  };
}

class FakeCancelableAiGenerator {
  readonly generate: AiGenerator = async (_command, signal, onChunk) => {
    onChunk("Resposta parcial");
    await new Promise<void>((resolve) => {
      signal.addEventListener("abort", () => resolve(), { once: true });
    });
    throw new DOMException("The operation was aborted.", "AbortError");
  };
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

  it("offers AI generation for an open application question", async () => {
    document.body.replaceChildren();
    addField("Conte sobre sua experiência");
    const runtime = new FakeOverlayRuntime({ values: {} });
    const generator = new FakeAiGenerator([]);
    const overlay = mountOverlay(document, runtime.sendMessage, undefined, generator.generate);

    await overlay.refresh();

    const root = document.getElementById("applyassist-overlay")?.shadowRoot;
    expect(root?.querySelector('[data-action="generate"]')?.textContent).toBe("Gerar");

    overlay.dispose();
  });

  it("streams a user-requested answer into the field and allows undo", async () => {
    document.body.replaceChildren();
    const input = addField("Conte sobre sua experiência");
    input.value = "Resposta anterior";
    const selectedText = document.createTextNode("Descrição selecionada pelo usuário.");
    document.body.append(selectedText);
    const range = document.createRange();
    range.selectNodeContents(selectedText);
    document.getSelection()?.addRange(range);
    const runtime = new FakeOverlayRuntime({ values: {} });
    const generator = new FakeAiGenerator(["Experiência ", "profissional."]);
    const overlay = mountOverlay(document, runtime.sendMessage, undefined, generator.generate);

    await overlay.refresh();
    const root = document.getElementById("applyassist-overlay")?.shadowRoot;
    root?.querySelector<HTMLInputElement>('[data-action="use-selected-text"]')?.click();
    root?.querySelector<HTMLButtonElement>('[data-action="generate"]')?.click();

    await vi.waitFor(() => {
      expect(input.value).toBe("Experiência profissional.");
    });
    expect(generator.requests).toEqual([
      {
        type: "AI_GENERATE",
        question: "Conte sobre sua experiência",
        language: "pt",
        selectedText: "Descrição selecionada pelo usuário.",
      },
    ]);
    expect(root?.textContent).toContain(ptBr.overlayAiGenerated);

    root?.querySelector<HTMLButtonElement>('[data-action="undo"]')?.click();
    expect(input.value).toBe("Resposta anterior");

    overlay.dispose();
  });

  it("announces the free-tier generation limit in friendly Portuguese", async () => {
    document.body.replaceChildren();
    addField("Why are you interested?");
    const runtime = new FakeOverlayRuntime({ values: {} });
    const generator = new FakeAiGenerator([], new AiGenerationError("daily-limit"));
    const overlay = mountOverlay(document, runtime.sendMessage, undefined, generator.generate);

    await overlay.refresh();
    const root = document.getElementById("applyassist-overlay")?.shadowRoot;
    root?.querySelector<HTMLButtonElement>('[data-action="generate"]')?.click();

    await vi.waitFor(() => {
      expect(root?.querySelector('[role="status"]')?.textContent).toBe(ptBr.overlayAiDailyLimit);
    });
    expect(root?.textContent).not.toContain("daily-limit");
    overlay.dispose();
  });

  it("does not include page text unless the user opts in to the selection", async () => {
    document.body.replaceChildren();
    addField("Why are you interested?");
    const selectedText = document.createTextNode("Unselected job description");
    document.body.append(selectedText);
    const range = document.createRange();
    range.selectNodeContents(selectedText);
    document.getSelection()?.addRange(range);
    const runtime = new FakeOverlayRuntime({ values: {} });
    const generator = new FakeAiGenerator(["A resposta."]);
    const overlay = mountOverlay(document, runtime.sendMessage, undefined, generator.generate);

    await overlay.refresh();
    document
      .getElementById("applyassist-overlay")
      ?.shadowRoot?.querySelector<HTMLButtonElement>('[data-action="generate"]')
      ?.click();

    await vi.waitFor(() => {
      expect(generator.requests).toHaveLength(1);
    });
    expect(generator.requests[0]).not.toHaveProperty("selectedText");
    overlay.dispose();
  });

  it("cancels a streaming response and keeps partial text undoable", async () => {
    document.body.replaceChildren();
    const input = addField("Conte sobre sua experiência");
    const runtime = new FakeOverlayRuntime({ values: {} });
    const generator = new FakeCancelableAiGenerator();
    const overlay = mountOverlay(document, runtime.sendMessage, undefined, generator.generate);

    await overlay.refresh();
    const root = document.getElementById("applyassist-overlay")?.shadowRoot;
    root?.querySelector<HTMLButtonElement>('[data-action="generate"]')?.click();
    await vi.waitFor(() => {
      expect(input.value).toBe("Resposta parcial");
    });
    root?.querySelector<HTMLButtonElement>('[data-action="cancel-ai"]')?.click();
    await vi.waitFor(() => {
      expect(root?.querySelector('[role="status"]')?.textContent).toBe(ptBr.overlayAiCancelled);
    });

    root?.querySelector<HTMLButtonElement>('[data-action="undo"]')?.click();
    expect(input.value).toBe("");
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
      expect(runtime.sendMessage).toHaveBeenCalledTimes(6);
    });

    overlay.dispose();
    addField("Nome completo");
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(runtime.sendMessage).toHaveBeenCalledTimes(6);
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
