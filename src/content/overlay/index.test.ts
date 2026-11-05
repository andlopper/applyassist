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
  readonly requests: AiGenerationCommand[] = [];

  readonly generate: AiGenerator = async (command, signal, onChunk) => {
    this.requests.push(command);
    onChunk("Resposta parcial");
    await new Promise<void>((resolve) => {
      signal.addEventListener("abort", () => resolve(), { once: true });
    });
    throw new DOMException("The operation was aborted.", "AbortError");
  };
}

class FakeUnresponsiveAiGenerator {
  private resolveGeneration: (() => void) | undefined;
  private resolveStarted: (() => void) | undefined;
  readonly started = new Promise<void>((resolve) => {
    this.resolveStarted = resolve;
  });

  readonly generate: AiGenerator = async (_command, _signal, onChunk) => {
    onChunk("Resposta parcial");
    this.resolveStarted?.();
    await new Promise<void>((resolve) => {
      this.resolveGeneration = resolve;
    });
  };

  complete(): void {
    this.resolveGeneration?.();
  }
}

class FakeStreamingCancelableAiGenerator {
  private onChunk: ((text: string) => void) | undefined;
  private resolveGeneration: (() => void) | undefined;
  private resolveStarted: (() => void) | undefined;
  readonly started = new Promise<void>((resolve) => {
    this.resolveStarted = resolve;
  });

  readonly generate: AiGenerator = async (_command, signal, onChunk) => {
    this.onChunk = onChunk;
    onChunk("Parte 1");
    this.resolveStarted?.();
    await new Promise<void>((resolve) => {
      this.resolveGeneration = resolve;
      signal.addEventListener("abort", () => resolve(), { once: true });
    });
    if (signal.aborted) {
      throw new DOMException("The operation was aborted.", "AbortError");
    }
  };

  emit(chunk: string): void {
    this.onChunk?.(chunk);
  }
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
    expect(root?.textContent).toContain("Preencher tudo");
    expect(root?.textContent).toContain("Gerar tudo");
    expect(root?.textContent).toContain("Desfazer");
    expect(root?.textContent).toContain("Aplicar");
    const actionGroups = root?.querySelectorAll(".actions .action-group");
    expect(
      Array.from(actionGroups?.[0]?.querySelectorAll("button") ?? []).map(
        (button) => button.textContent,
      ),
    ).toEqual(["Gerar tudo", "Cancelar"]);
    expect(
      Array.from(actionGroups?.[1]?.querySelectorAll("button") ?? []).map(
        (button) => button.textContent,
      ),
    ).toEqual(["Preencher tudo", "Desfazer"]);
    expect(root?.querySelector('[data-action="generate-all"] .loading-spinner')).toBeNull();

    overlay.dispose();
  });

  it("shows a spinner and a generating label while a single answer is loading", async () => {
    document.body.replaceChildren();
    addField("Describe your strengths");
    const runtime = new FakeOverlayRuntime({ values: {} });
    const generator = new FakeUnresponsiveAiGenerator();
    const overlay = mountOverlay(document, runtime.sendMessage, undefined, generator.generate);

    await overlay.refresh();
    const root = document.getElementById("applyassist-overlay")?.shadowRoot;
    root?.querySelector<HTMLButtonElement>('[data-action="generate"]')?.click();
    await generator.started;

    const generatingButton = root?.querySelector<HTMLButtonElement>(
      '[data-action="generate"]',
    );
    expect(generatingButton?.disabled).toBe(true);
    expect(generatingButton?.textContent).toContain(ptBr.overlayAiGenerating);
    expect(generatingButton?.querySelector(".loading-spinner")).not.toBeNull();
    expect(generatingButton?.getAttribute("aria-label")).toBe(ptBr.overlayAiGenerating);

    root?.querySelector<HTMLButtonElement>('[data-action="cancel-ai-field"]')?.click();
    await vi.waitFor(() => {
      expect(root?.querySelector('[role="status"]')?.textContent).toBe(ptBr.overlayAiCancelled);
    });
    expect(root?.querySelector(".suggestion")?.textContent).toBe(ptBr.overlayNoSuggestion);

    generator.complete();
    overlay.dispose();
  });

  it("keeps the active cancel button stable while streamed text updates", async () => {
    document.body.replaceChildren();
    addField("Describe your strengths");
    const runtime = new FakeOverlayRuntime({ values: {} });
    const generator = new FakeStreamingCancelableAiGenerator();
    const overlay = mountOverlay(document, runtime.sendMessage, undefined, generator.generate);

    await overlay.refresh();
    const root = document.getElementById("applyassist-overlay")?.shadowRoot;
    root?.querySelector<HTMLButtonElement>('[data-action="generate"]')?.click();
    await generator.started;
    const cancelButton = root?.querySelector<HTMLButtonElement>(
      '[data-action="cancel-ai-field"]',
    );
    generator.emit("Parte 2");

    expect(root?.querySelector(".suggestion")?.textContent).toBe("Parte 1Parte 2");
    expect(root?.querySelector('[data-action="cancel-ai-field"]')).toBe(cancelButton);
    cancelButton?.click();
    await vi.waitFor(() => {
      expect(root?.querySelector('[role="status"]')?.textContent).toBe(ptBr.overlayAiCancelled);
    });

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

  it("shows a generated answer for review and applies it only after explicit approval", async () => {
    document.body.replaceChildren();
    const input = addField("Conte sobre sua experiência");
    const inputEvent = vi.fn();
    input.addEventListener("input", inputEvent);
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
      expect(root?.querySelector(".suggestion")?.textContent).toBe("Experiência profissional.");
    });
    await vi.waitFor(() => {
      expect(root?.querySelector('[role="status"]')?.textContent).toBe(ptBr.overlayAiGenerated);
    });
    expect(input.value).toBe("");
    expect(inputEvent).not.toHaveBeenCalled();
    expect(generator.requests).toEqual([
      {
        type: "AI_GENERATE",
        question: "Conte sobre sua experiência",
        language: "pt",
        selectedText: "Descrição selecionada pelo usuário.",
      },
    ]);
    expect(root?.textContent).toContain(ptBr.overlayAiGenerated);
    const fieldActions = root?.querySelector(".field-actions");
    expect(
      Array.from(fieldActions?.querySelectorAll("button") ?? []).map(
        (button) => button.textContent,
      ),
    ).toEqual(["Gerar", "Aplicar"]);
    expect(root?.querySelector("style")?.textContent).toContain(
      ".field-actions { display: flex; flex-wrap: wrap; gap: 8px; }",
    );

    root?.querySelector<HTMLButtonElement>('[data-action="apply-generated"]')?.click();
    expect(input.value).toBe("Experiência profissional.");
    expect(inputEvent).toHaveBeenCalledOnce();

    root?.querySelector<HTMLButtonElement>('[data-action="undo-field"]')?.click();
    expect(input.value).toBe("");

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

  it("discards a cancelled partial response and restores the initial field state", async () => {
    document.body.replaceChildren();
    const input = addField("Conte sobre sua experiência");
    const runtime = new FakeOverlayRuntime({ values: {} });
    const generator = new FakeCancelableAiGenerator();
    const overlay = mountOverlay(document, runtime.sendMessage, undefined, generator.generate);

    await overlay.refresh();
    const root = document.getElementById("applyassist-overlay")?.shadowRoot;
    root?.querySelector<HTMLButtonElement>('[data-action="generate"]')?.click();
    await vi.waitFor(() => {
      expect(root?.querySelector(".suggestion")?.textContent).toBe("Resposta parcial");
    });
    expect(input.value).toBe("");
    expect(root?.querySelector('[data-action="apply-generated"]')).toBeNull();
    expect(root?.querySelector('[data-action="cancel-ai-field"]')).not.toBeNull();
    expect(root?.querySelector('[data-action="apply-generated"]')).toBeNull();
    root?.querySelector<HTMLButtonElement>('[data-action="cancel-ai-field"]')?.click();
    await vi.waitFor(() => {
      expect(root?.querySelector('[role="status"]')?.textContent).toBe(ptBr.overlayAiCancelled);
    });

    expect(root?.querySelector(".suggestion")?.textContent).toBe(ptBr.overlayNoSuggestion);
    expect(root?.querySelector('[data-action="apply-generated"]')).toBeNull();
    expect(root?.querySelector<HTMLButtonElement>('[data-action="undo"]')?.disabled).toBe(true);
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
    expect(
      document
        .getElementById("applyassist-overlay")
        ?.shadowRoot?.querySelector<HTMLButtonElement>('[data-action="undo"]')?.disabled,
    ).toBe(true);
    expect(
      document
        .getElementById("applyassist-overlay")
        ?.shadowRoot?.querySelector('[data-action="undo-field"]'),
    ).not.toBeNull();

    document
      .getElementById("applyassist-overlay")
      ?.shadowRoot?.querySelector<HTMLButtonElement>('[data-action="undo-field"]')
      ?.click();

    expect(input.value).toBe("");
    overlay.dispose();
  });

  it("fills only ready empty fields when the batch action is used", async () => {
    document.body.replaceChildren();
    const emptyInput = addField("Pretensão salarial");
    const anotherEmptyInput = addField("E-mail", "email");
    const filledInput = addField("Cidade");
    filledInput.value = "Valor existente";
    const runtime = new FakeOverlayRuntime({
      values: { salaryExpectation: "R$ 10.000", email: "ana@example.test", city: "Recife" },
    });
    const overlay = mountOverlay(document, runtime.sendMessage);

    await overlay.refresh();
    document
      .getElementById("applyassist-overlay")
      ?.shadowRoot?.querySelector<HTMLButtonElement>('[data-action="apply-ready"]')
      ?.click();

    expect(emptyInput.value).toBe("R$ 10.000");
    expect(anotherEmptyInput.value).toBe("ana@example.test");
    expect(filledInput.value).toBe("Valor existente");
    expect(
      document
        .getElementById("applyassist-overlay")
        ?.shadowRoot?.querySelector('[data-action="undo"]'),
    ).not.toBeNull();

    document
      .getElementById("applyassist-overlay")
      ?.shadowRoot?.querySelector<HTMLButtonElement>('[data-action="undo"]')
      ?.click();
    expect(emptyInput.value).toBe("");
    expect(anotherEmptyInput.value).toBe("");
    expect(filledInput.value).toBe("Valor existente");

    overlay.dispose();
  });

  it("fills completed AI answers together with ready suggestions and undoes the whole batch", async () => {
    document.body.replaceChildren();
    const suggestedField = addField("E-mail", "email");
    const aiField = addField("Describe your strengths");
    const runtime = new FakeOverlayRuntime({ values: { email: "ana@example.test" } });
    const generator = new FakeAiGenerator(["Resposta revisável."]);
    const overlay = mountOverlay(document, runtime.sendMessage, undefined, generator.generate);

    await overlay.refresh();
    const root = document.getElementById("applyassist-overlay")?.shadowRoot;
    root?.querySelector<HTMLButtonElement>('[data-action="generate"]')?.click();
    await vi.waitFor(() => {
      expect(root?.querySelector('[data-action="apply-generated"]')).not.toBeNull();
    });

    root?.querySelector<HTMLButtonElement>('[data-action="apply-ready"]')?.click();
    expect(suggestedField.value).toBe("ana@example.test");
    expect(aiField.value).toBe("Resposta revisável.");
    expect(root?.querySelector<HTMLButtonElement>('[data-action="undo"]')?.disabled).toBe(false);

    root?.querySelector<HTMLButtonElement>('[data-action="undo"]')?.click();
    expect(suggestedField.value).toBe("");
    expect(aiField.value).toBe("");
    expect(root?.querySelectorAll(".suggestion").item(1)?.textContent).toBe(
      ptBr.overlayNoSuggestion,
    );
    expect(root?.querySelector<HTMLButtonElement>('[data-action="undo"]')?.disabled).toBe(true);

    overlay.dispose();
  });

  it("keeps batch actions in a fixed, aligned footer", async () => {
    document.body.replaceChildren();
    addField("Describe your strengths");
    const runtime = new FakeOverlayRuntime({ values: {} });
    const generator = new FakeAiGenerator(["Resposta revisável."]);
    const overlay = mountOverlay(document, runtime.sendMessage, undefined, generator.generate);

    await overlay.refresh();
    const root = document.getElementById("applyassist-overlay")?.shadowRoot;
    const actions = root?.querySelector(".actions");
    const footer = root?.querySelector(".footer");
    const content = root?.querySelector(".content");
    const actionGroups = root?.querySelectorAll(".actions .action-group");
    const style = root?.querySelector("style")?.textContent ?? "";

    expect(actions?.parentElement?.classList.contains("footer")).toBe(true);
    expect(root?.querySelector(".panel")?.firstElementChild?.classList.contains("heading")).toBe(
      true,
    );
    expect(root?.querySelector(".heading")?.contains(root?.querySelector('[data-action="close"]') ?? null)).toBe(
      true,
    );
    expect(footer?.contains(root?.querySelector("h2") ?? null)).toBe(false);
    expect(content?.contains(root?.querySelector(".counts") ?? null)).toBe(true);
    expect(content?.contains(root?.querySelector(".fields") ?? null)).toBe(true);
    expect(content?.previousElementSibling?.classList.contains("heading")).toBe(true);
    expect(style).toContain("height: min(50vh, 500px)");
    expect(style).toContain(".content { flex: 1 1 auto;");
    expect(style).toContain(".actions { display: grid; gap: 8px; grid-template-columns: 1fr; }");
    expect(style).toContain(".loading-spinner { animation: applyassist-spin .8s linear infinite;");
    expect(style).toContain("align-items: center; display: inline-flex; gap: 8px;");
    expect(style).toContain("overflow-y: auto");
    expect(style).toContain(".actions button { min-height: 40px;");
    expect(style).toContain("white-space: nowrap; width: 100%;");
    expect(style).toContain(".field-actions { display: flex; flex-wrap: wrap; gap: 8px; }");
    const fieldActions = root?.querySelector(".field-actions");
    expect(fieldActions?.querySelector('[data-action="generate"]')?.textContent).toBe("Gerar");
    expect(root?.querySelector<HTMLButtonElement>('[data-action="cancel-ai"]')?.disabled).toBe(
      true,
    );
    expect(root?.querySelector('[data-action="generate-all"]')?.textContent).toBe("Gerar tudo");
    expect(root?.querySelector('[data-action="apply-ready"]')?.textContent).toBe("Preencher tudo");

    root?.querySelector<HTMLButtonElement>('[data-action="generate-all"]')?.click();
    expect(root?.querySelector('[data-action="generate-all"]')?.textContent).toContain(
      ptBr.overlayAiGenerating,
    );
    await vi.waitFor(() => {
      expect(root?.querySelector('[data-action="apply-generated"]')).not.toBeNull();
    });
    expect(
      Array.from(actionGroups?.[0]?.querySelectorAll("button") ?? []).map(
        (button) => button.textContent,
      ),
    ).toEqual(["Gerar tudo", "Cancelar"]);
    expect(
      Array.from(actionGroups?.[1]?.querySelectorAll("button") ?? []).map(
        (button) => button.textContent,
      ),
    ).toEqual(["Preencher tudo", "Desfazer"]);

    overlay.dispose();
  });

  it("generates answers for all empty open fields without filling them", async () => {
    document.body.replaceChildren();
    const first = addField("Why are you interested?");
    const second = addField("Describe your strengths");
    const alreadyFilled = addField("What motivates you?");
    alreadyFilled.value = "Existing answer";
    const runtime = new FakeOverlayRuntime({ values: {} });
    const generator = new FakeAiGenerator(["Resposta revisável."]);
    const overlay = mountOverlay(document, runtime.sendMessage, undefined, generator.generate);

    await overlay.refresh();
    const root = document.getElementById("applyassist-overlay")?.shadowRoot;
    root?.querySelector<HTMLButtonElement>('[data-action="generate-all"]')?.click();
    await vi.waitFor(() => {
      expect(generator.requests).toHaveLength(2);
      expect(root?.querySelectorAll('[data-action="apply-generated"]')).toHaveLength(2);
    });

    expect(first.value).toBe("");
    expect(second.value).toBe("");
    expect(alreadyFilled.value).toBe("Existing answer");
    expect(root?.querySelector<HTMLButtonElement>('[data-action="cancel-ai"]')?.disabled).toBe(
      true,
    );

    root?.querySelector<HTMLButtonElement>('[data-action="apply-generated"]')?.click();
    root?.querySelector<HTMLButtonElement>('[data-action="apply-generated"]')?.click();
    expect(first.value).toBe("Resposta revisável.");
    expect(second.value).toBe("Resposta revisável.");
    expect(root?.querySelectorAll('[data-action="undo-field"]')).toHaveLength(2);
    expect(root?.querySelector('[data-action="undo"]')?.hasAttribute("disabled")).toBe(true);

    overlay.dispose();
  });

  it("cancels generate-all before it starts generating the next field", async () => {
    document.body.replaceChildren();
    const first = addField("Why are you interested?");
    const second = addField("Describe your strengths");
    const runtime = new FakeOverlayRuntime({ values: {} });
    const generator = new FakeCancelableAiGenerator();
    const overlay = mountOverlay(document, runtime.sendMessage, undefined, generator.generate);

    await overlay.refresh();
    const root = document.getElementById("applyassist-overlay")?.shadowRoot;
    root?.querySelector<HTMLButtonElement>('[data-action="generate-all"]')?.click();
    await vi.waitFor(() => {
      expect(root?.querySelector<HTMLButtonElement>('[data-action="cancel-ai"]')?.disabled).toBe(
        false,
      );
    });
    expect(root?.querySelector(".suggestion")?.textContent).toBe("Resposta parcial");
    root?.querySelector<HTMLButtonElement>('[data-action="cancel-ai"]')?.click();

    await vi.waitFor(() => {
      expect(root?.querySelector<HTMLButtonElement>('[data-action="cancel-ai"]')?.disabled).toBe(
        true,
      );
    });
    expect(root?.querySelectorAll(".suggestion").item(0)?.textContent).toBe(
      ptBr.overlayNoSuggestion,
    );
    expect(root?.querySelector('[data-action="apply-generated"]')).toBeNull();
    expect(first.value).toBe("");
    expect(second.value).toBe("");
    expect(generator.requests).toHaveLength(1);

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

    root?.querySelector<HTMLButtonElement>('[data-action="undo-field"]')?.click();
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
