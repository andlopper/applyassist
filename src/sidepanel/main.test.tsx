import { render } from "preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SidePanelApp } from "./main";

type RuntimeConnectResult = {
  postMessage: (message: unknown) => void;
  disconnect: () => void;
  onMessage: {
    addListener: (listener: (message: unknown) => void) => void;
    removeListener: (listener: (message: unknown) => void) => void;
  };
  onDisconnect: {
    addListener: (listener: () => void) => void;
    removeListener: (listener: () => void) => void;
  };
};

class FakePort implements RuntimeConnectResult {
  readonly listeners = new Set<(message: unknown) => void>();
  readonly onMessage = {
    addListener: (listener: (message: unknown) => void): void => {
      this.listeners.add(listener);
    },
    removeListener: (listener: (message: unknown) => void): void => {
      this.listeners.delete(listener);
    },
  };
  readonly onDisconnect = {
    addListener: vi.fn(),
    removeListener: vi.fn(),
  };
  readonly postMessage = vi.fn();
  readonly disconnect = vi.fn();

  emit(message: unknown): void {
    for (const listener of this.listeners) {
      listener(message);
    }
  }
}

type RuntimeTestChrome = {
  runtime: {
    sendMessage: (
      message: unknown,
      callback?: (response?: unknown) => void,
    ) => void | Promise<unknown>;
    connect?: (info: { name: string }) => RuntimeConnectResult;
  };
};

describe("side panel paste mode", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  afterEach(() => {
    render(null, document.body);
    delete (globalThis as typeof globalThis & { chrome?: unknown }).chrome;
    vi.restoreAllMocks();
  });

  async function flushUi(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  function setChromeRuntime(
    runtime: RuntimeTestChrome["runtime"],
  ): void {
    (globalThis as typeof globalThis & { chrome?: RuntimeTestChrome }).chrome = {
      runtime,
    };
  }

  it("renders the paste form with the expected fields", async () => {
    setChromeRuntime({
      sendMessage: vi.fn((_message, callback) => callback?.({ available: true })),
    });

    render(<SidePanelApp />, document.body);
    await flushUi();

    expect(document.body.textContent).toContain("Modo colar");
    expect(document.body.textContent).toContain("Pergunta");
    expect(document.body.textContent).toContain("Descrição da vaga");
    expect(document.body.textContent).toContain("Resposta");
  });

  it("shows the unavailable state when the AI connection is disabled", async () => {
    setChromeRuntime({
      sendMessage: vi.fn((_message, callback) => callback?.({ available: false })),
    });

    render(<SidePanelApp />, document.body);
    await flushUi();

    expect(document.body.textContent).toContain("Conexão de IA indisponível");
  });

  it("opens the AI generation port when the user clicks Gerar", async () => {
    const port = new FakePort();
    const sendMessage = vi.fn((_message, callback) => callback?.({ available: true }));
    const connect = vi.fn(() => port);
    setChromeRuntime({ sendMessage, connect });

    render(<SidePanelApp />, document.body);
    await flushUi();

    const textareas = Array.from(document.querySelectorAll("textarea"));
    const question = textareas[0] as HTMLTextAreaElement;
    const jobDescription = textareas[1] as HTMLTextAreaElement;
    question.value = "Qual é sua experiência?";
    question.dispatchEvent(new InputEvent("input", { bubbles: true }));
    jobDescription.value = "Trabalhei em projetos de backend e liderança.";
    jobDescription.dispatchEvent(new InputEvent("input", { bubbles: true }));
    await flushUi();

    const button = Array.from(document.querySelectorAll("button")).find((element) =>
      element.textContent?.includes("Gerar"),
    ) as HTMLButtonElement;
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flushUi();

    expect(connect).toHaveBeenCalledWith({ name: "AI_GENERATE" });
    expect(port.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: "AI_GENERATE", question: "Qual é sua experiência?" }),
    );

    port.emit({ type: "AI_CHUNK", text: "Tenho " });
    port.emit({ type: "AI_CHUNK", text: "10 anos." });
    port.emit({ type: "AI_DONE" });
    await flushUi();

    expect(document.body.textContent).toContain("Resposta pronta para revisão.");
    expect((Array.from(document.querySelectorAll("textarea"))[(Array.from(document.querySelectorAll("textarea")).length - 1)] as HTMLTextAreaElement).value).toContain(
      "Tenho 10 anos.",
    );
  });

  it("copies the generated answer to the clipboard", async () => {
    const clipboard = { writeText: vi.fn().mockResolvedValue(undefined) };
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: clipboard,
    });
    setChromeRuntime({
      sendMessage: vi.fn((_message, callback) => callback?.({ available: true })),
    });

    render(<SidePanelApp />, document.body);
    await flushUi();

    const output = Array.from(document.querySelectorAll("textarea")).at(-1) as HTMLTextAreaElement;
    output.value = "Resposta de teste";
    output.dispatchEvent(new InputEvent("input", { bubbles: true }));
    await flushUi();

    const copyButton = Array.from(document.querySelectorAll("button")).find((element) =>
      element.textContent?.includes("Copiar"),
    ) as HTMLButtonElement;
    copyButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flushUi();

    expect(clipboard.writeText).toHaveBeenCalledWith("Resposta de teste");
    expect(document.body.textContent).toContain("Texto copiado.");
  });
});
