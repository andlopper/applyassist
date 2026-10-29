import { describe, expect, it, vi } from "vitest";
import {
  AiProviderError,
  type AiProvider,
  type GenerateRequest,
} from "../adapters/ai";
import { FakeStorage } from "../adapters/storage";
import {
  registerBackground,
  type BackgroundAiPort,
  type BackgroundChrome,
} from "./main";
import type { AiGenerationPortEvent } from "../shared/messages";
import type { MessageListener, RuntimeSender } from "./router";

class FakeBackgroundAiPort implements BackgroundAiPort {
  name = "AI_GENERATE";
  sender?: RuntimeSender;
  readonly events: AiGenerationPortEvent[] = [];
  private readonly messageListeners = new Set<(message: unknown) => void>();
  private readonly disconnectListeners = new Set<() => void>();

  readonly onMessage = {
    addListener: (listener: (message: unknown) => void): void => {
      this.messageListeners.add(listener);
    },
    removeListener: (listener: (message: unknown) => void): void => {
      this.messageListeners.delete(listener);
    },
  };
  readonly onDisconnect = {
    addListener: (listener: () => void): void => {
      this.disconnectListeners.add(listener);
    },
    removeListener: (listener: () => void): void => {
      this.disconnectListeners.delete(listener);
    },
  };

  postMessage(message: AiGenerationPortEvent): void {
    this.events.push(message);
  }

  disconnect(): void {
    for (const listener of this.disconnectListeners) {
      listener();
    }
  }

  send(message: unknown): void {
    for (const listener of this.messageListeners) {
      listener(message);
    }
  }
}

class FakeAiProvider implements AiProvider {
  readonly id = "openrouter" as const;
  readonly requests: GenerateRequest[] = [];

  constructor(private readonly error?: Error) {}

  async listModels(): Promise<{ id: string; label: string }[]> {
    return [];
  }

  async *generate(request: GenerateRequest): AsyncGenerator<string> {
    this.requests.push(request);
    if (this.error) {
      throw this.error;
    }
    yield "Resposta ";
    yield "gerada.";
  }
}

class FakeWaitingAiProvider implements AiProvider {
  readonly id = "openrouter" as const;
  started = false;
  aborted = false;

  async listModels(): Promise<{ id: string; label: string }[]> {
    return [];
  }

  async *generate(_request: GenerateRequest, signal: AbortSignal): AsyncGenerator<string> {
    this.started = true;
    await new Promise<void>((resolve) => {
      signal.addEventListener(
        "abort",
        () => {
          this.aborted = true;
          resolve();
        },
        { once: true },
      );
    });
  }
}

class FakeBackgroundChrome implements BackgroundChrome {
  private messageListener: MessageListener | undefined;
  private readonly connectListeners = new Set<(port: BackgroundAiPort) => void>();
  private commandListener: ((command: string) => void) | undefined;
  readonly commands = {
    onCommand: {
      addListener: (listener: (command: string) => void) => {
        this.commandListener = listener;
      },
    },
  };
  readonly tabs = {
    query: async (details: { active: boolean; currentWindow: boolean }) => {
      this.tabQueries.push(details);
      return this.activeTabs;
    },
  };
  readonly tabQueries: Array<{ active: boolean; currentWindow: boolean }> = [];
  activeTabs: Array<{ id?: number }> = [];
  readonly runtime = {
    id: "extension-id",
    onMessage: {
      addListener: (listener: MessageListener) => {
        this.messageListener = listener;
      },
      removeListener: (listener: MessageListener) => {
        if (this.messageListener === listener) {
          this.messageListener = undefined;
        }
      },
    },
    onConnect: {
      addListener: (listener: (port: BackgroundAiPort) => void) => {
        this.connectListeners.add(listener);
      },
    },
  };
  readonly action = {
    onClicked: {
      addListener: (listener: (tab: { id?: number; url?: string }) => void) => {
        this.clickListener = listener;
      },
    },
    setBadgeText: async (details: { text: string; tabId: number }) => {
      this.badges.push(details);
    },
    setTitle: async (details: { title: string; tabId: number }) => {
      this.titles.push(details);
    },
  };
  readonly scripting = {
    executeScript: async (details: { target: { tabId: number }; files: string[] }) => {
      this.scripts.push(details);
    },
  };
  readonly sidePanel = {
    open: async (details: { tabId: number }) => {
      this.openedPanels.push(details);
    },
  };
  readonly badges: { text: string; tabId: number }[] = [];
  readonly titles: { title: string; tabId: number }[] = [];
  readonly scripts: { target: { tabId: number }; files: string[] }[] = [];
  readonly openedPanels: { tabId: number }[] = [];
  clickListener: ((tab: { id?: number; url?: string }) => void) | undefined;

  click(tab: { id?: number; url?: string }): void {
    this.clickListener?.(tab);
  }

  runCommand(command: string): void {
    this.commandListener?.(command);
  }

  sendMessage(
    message: unknown,
    sender: RuntimeSender,
    sendResponse: (response?: unknown) => void,
  ): boolean | void {
    return this.messageListener?.(message, sender, sendResponse);
  }

  connect(port: BackgroundAiPort): void {
    for (const listener of this.connectListeners) {
      listener(port);
    }
  }
}

describe("R-01/R-17 background action", () => {
  it.each([
    ["verified", "https://gupy.io/vaga"],
    ["unverified", "https://example.org/vaga"],
  ])("injects content.js on a %s site", async (_policy, url) => {
    const chrome = new FakeBackgroundChrome();
    registerBackground(chrome, new FakeStorage());

    chrome.click({ id: 7, url });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(chrome.scripts).toEqual([{ target: { tabId: 7 }, files: ["content.js"] }]);
    expect(chrome.openedPanels).toEqual([]);
  });

  it("opens the side panel using the active tab when the paste shortcut runs", async () => {
    const chrome = new FakeBackgroundChrome();
    chrome.activeTabs = [{ id: 21 }];
    registerBackground(chrome, new FakeStorage());

    chrome.runCommand("open-paste-mode");
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(chrome.openedPanels).toEqual([{ tabId: 21 }]);
    expect(chrome.tabQueries).toEqual([{ active: true, currentWindow: true }]);
  });

  it("marks unverified sites with a warning badge and title", async () => {
    const chrome = new FakeBackgroundChrome();
    registerBackground(chrome, new FakeStorage());

    chrome.click({ id: 11, url: "https://example.org/vaga" });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(chrome.badges).toContainEqual({ text: "?", tabId: 11 });
    expect(chrome.titles.at(-1)?.title).toContain("não foi verificado");
  });

  it("opens the side panel without injection for a blocked site", async () => {
    const chrome = new FakeBackgroundChrome();
    registerBackground(chrome, new FakeStorage());

    chrome.click({ id: 8, url: "https://www.linkedin.com/jobs" });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(chrome.openedPanels).toEqual([{ tabId: 8 }]);
    expect(chrome.scripts).toEqual([]);
  });

  it("reports a warning for a site override with an invalid value", async () => {
    const chrome = new FakeBackgroundChrome();
    const storage = new FakeStorage();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await storage.setItem("settings:v1", {
      schemaVersion: 1,
      value: { siteOverrides: { "example.org": "invalid" } },
    });
    registerBackground(chrome, storage);

    chrome.click({ id: 12, url: "https://example.org" });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(chrome.scripts).toHaveLength(1);
    expect(warn).toHaveBeenCalledWith("Invalid stored site override; ignoring the invalid entry.");
    warn.mockRestore();
  });

  it("uses no overrides when the stored settings envelope is invalid", async () => {
    const chrome = new FakeBackgroundChrome();
    const storage = new FakeStorage();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await storage.setItem("settings:v1", {
      schemaVersion: 0,
      value: { siteOverrides: { "example.org": "block" } },
    });
    registerBackground(chrome, storage);

    chrome.click({ id: 13, url: "https://example.org" });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(chrome.scripts).toHaveLength(1);
    expect(chrome.openedPanels).toHaveLength(0);
    expect(warn).toHaveBeenCalledWith("Invalid stored site overrides; using no overrides.");
    warn.mockRestore();
  });

  it("reports a missing active-tab URL", async () => {
    const chrome = new FakeBackgroundChrome();
    registerBackground(chrome, new FakeStorage());

    chrome.click({ id: 14 });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(chrome.badges).toEqual([{ text: "!", tabId: 14 }]);
  });

  it("does not call Chrome APIs when the active tab has no numeric ID", async () => {
    const chrome = new FakeBackgroundChrome();
    registerBackground(chrome, new FakeStorage());

    chrome.click({ url: "https://example.org" });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(chrome.scripts).toEqual([]);
    expect(chrome.badges).toEqual([]);
  });

  it("shows the error badge if opening the side panel fails", async () => {
    const chrome = new FakeBackgroundChrome();
    chrome.sidePanel.open = async () => {
      throw new Error("panel unavailable");
    };
    registerBackground(chrome, new FakeStorage());

    chrome.click({ id: 15, url: "https://linkedin.com" });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(chrome.badges).toContainEqual({ text: "!", tabId: 15 });
  });

  it("respects site overrides stored in the versioned local settings value", async () => {
    const chrome = new FakeBackgroundChrome();
    const storage = new FakeStorage();
    await storage.setItem("settings:v1", {
      schemaVersion: 1,
      value: { siteOverrides: { "example.org": "block" } },
    });
    registerBackground(chrome, storage);

    chrome.click({ id: 9, url: "https://jobs.example.org" });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(chrome.openedPanels).toEqual([{ tabId: 9 }]);
    expect(chrome.scripts).toEqual([]);
  });

  it("sets the warning badge and title when the page cannot be injected", async () => {
    const chrome = new FakeBackgroundChrome();
    chrome.scripting.executeScript = async () => {
      throw new Error("injection rejected");
    };
    registerBackground(chrome, new FakeStorage());

    chrome.click({ id: 10, url: "chrome://settings" });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(chrome.badges).toEqual([{ text: "!", tabId: 10 }]);
    expect(chrome.titles.at(-1)?.title).toContain("não foi possível");
  });

  it("returns only requested, known, non-sensitive profile fields", async () => {
    const chrome = new FakeBackgroundChrome();
    const storage = new FakeStorage();
    await storage.setItem("profile:v1", {
      schemaVersion: 1,
      value: {
        values: {
          fullName: "Ana Exemplo",
          email: "ana@example.test",
          city: "Recife",
          cpf: "123.456.789-00",
        },
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    });
    registerBackground(chrome, storage);
    const sendResponse = vi.fn();

    const keepChannelOpen = chrome.sendMessage(
      {
        type: "GET_FILL_VALUES",
        fieldKeys: ["fullName", "email", "city", "cpf", "unknown"],
        host: "example.org",
      },
      { id: chrome.runtime.id, tab: { id: 17 } },
      sendResponse,
    );
    expect(keepChannelOpen).toBe(true);

    await vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalledWith({
        values: { fullName: "Ana Exemplo", email: "ana@example.test", city: "Recife" },
      });
    });
  });

  it("persists an unreviewed mapping from a unique profile value", async () => {
    const chrome = new FakeBackgroundChrome();
    const storage = new FakeStorage();
    await storage.setItem("profile:v1", {
      schemaVersion: 1,
      value: {
        values: { email: "ada@example.test" },
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    });
    registerBackground(chrome, storage);
    const sendResponse = vi.fn();

    chrome.sendMessage(
      {
        type: "LEARN_EVENT",
        labelNorm: "Correo electrónico",
        value: "ada@example.test",
        kind: "short",
        host: "example.org",
      },
      { id: chrome.runtime.id, tab: { id: 21 } },
      sendResponse,
    );

    await vi.waitFor(async () => {
      expect(sendResponse).toHaveBeenCalledWith({ kind: "mapping" });
      expect(await storage.getItem("mappings:v1")).toMatchObject({
        schemaVersion: 1,
        value: [
          {
            labelNorm: "correo electronico",
            fieldKey: "email",
            reviewed: false,
            host: "example.org",
          },
        ],
      });
    });
  });

  it("stores a changed known-field value as a conflict without changing the profile", async () => {
    const chrome = new FakeBackgroundChrome();
    const storage = new FakeStorage();
    await storage.setItem("profile:v1", {
      schemaVersion: 1,
      value: {
        values: { email: "ada@example.test" },
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    });
    registerBackground(chrome, storage);
    const sendResponse = vi.fn();

    chrome.sendMessage(
      {
        type: "LEARN_EVENT",
        labelNorm: "E-mail",
        value: "new@example.test",
        kind: "short",
        fieldKey: "email",
        host: "example.org",
      },
      { id: chrome.runtime.id, tab: { id: 22 } },
      sendResponse,
    );

    await vi.waitFor(async () => {
      expect(sendResponse).toHaveBeenCalledWith({ kind: "conflict" });
      expect(await storage.getItem("conflicts:v1")).toMatchObject({
        schemaVersion: 1,
        value: [
          {
            fieldKey: "email",
            stored: "ada@example.test",
            seen: "new@example.test",
            host: "example.org",
          },
        ],
      });
    });
    expect(await storage.getItem("profile:v1")).toMatchObject({
      value: { values: { email: "ada@example.test" } },
    });
  });

  it("R-08 does not learn labels saved in the ignored-label list", async () => {
    const chrome = new FakeBackgroundChrome();
    const storage = new FakeStorage();
    await storage.setItem("ignored-labels:v1", {
      schemaVersion: 1,
      value: ["preferred city"],
    });
    registerBackground(chrome, storage);
    const sendResponse = vi.fn();

    chrome.sendMessage(
      {
        type: "LEARN_EVENT",
        labelNorm: "Preferred city",
        value: "Lisbon",
        kind: "short",
        host: "example.org",
      },
      { id: chrome.runtime.id, tab: { id: 24 } },
      sendResponse,
    );

    await vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalledWith({ kind: "ignored" });
    });
    expect(await storage.getItem("answers:v1")).toBeUndefined();
    expect(await storage.getItem("mappings:v1")).toBeUndefined();
  });

  it("validates and retains existing learning records", async () => {
    const chrome = new FakeBackgroundChrome();
    const storage = new FakeStorage();
    await storage.setItem("mappings:v1", {
      schemaVersion: 1,
      value: [
        {
          labelNorm: "preferred email",
          fieldKey: "email",
          reviewed: true,
          hits: 4,
          lastSeen: "2026-01-01T00:00:00.000Z",
          host: "example.org",
        },
      ],
    });
    await storage.setItem("answers:v1", {
      schemaVersion: 1,
      value: [
        {
          labelNorm: "why this role",
          answer: "Build useful products",
          scope: "job",
          host: "example.org",
          jobKey: "example.org/jobs/42",
          reviewed: false,
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    });
    await storage.setItem("conflicts:v1", {
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
    });
    registerBackground(chrome, storage);
    const sendResponse = vi.fn();

    chrome.sendMessage(
      {
        type: "LEARN_EVENT",
        labelNorm: "Describe your goals",
        value: "Improve accessibility",
        kind: "open_text",
        host: "example.org",
      },
      { id: chrome.runtime.id, tab: { id: 23 } },
      sendResponse,
    );

    await vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalledWith({ kind: "answer" });
    });
    expect(await storage.getItem("mappings:v1")).toMatchObject({
      value: [{ labelNorm: "preferred email", reviewed: true }],
    });
    expect(await storage.getItem("conflicts:v1")).toMatchObject({
      value: [{ fieldKey: "city", seen: "Lisbon" }],
    });
    expect(await storage.getItem("answers:v1")).toMatchObject({
      value: [
        { jobKey: "example.org/jobs/42" },
        { labelNorm: "describe goals", scope: "job", reviewed: false },
      ],
    });
  });

  it("returns global and matching-host mappings, preferring the host mapping", async () => {
    const chrome = new FakeBackgroundChrome();
    const storage = new FakeStorage();
    await storage.setItem("mappings:v1", {
      schemaVersion: 1,
      value: [
        {
          labelNorm: "where are you based",
          fieldKey: "country",
          reviewed: true,
          hits: 1,
          lastSeen: "2026-01-01T00:00:00.000Z",
        },
        {
          labelNorm: "where are you based",
          fieldKey: "city",
          reviewed: false,
          hits: 2,
          lastSeen: "2026-01-02T00:00:00.000Z",
          host: "example.org",
        },
        {
          labelNorm: "where are you based",
          fieldKey: "state",
          reviewed: true,
          hits: 1,
          lastSeen: "2026-01-03T00:00:00.000Z",
          host: "other.example",
        },
        {
          labelNorm: "work email",
          fieldKey: "email",
          reviewed: true,
          hits: 1,
          lastSeen: "2026-01-04T00:00:00.000Z",
        },
      ],
    });
    registerBackground(chrome, storage);
    const sendResponse = vi.fn();

    chrome.sendMessage(
      { type: "GET_MAPPINGS", host: "EXAMPLE.ORG" },
      { id: chrome.runtime.id, tab: { id: 25 } },
      sendResponse,
    );

    await vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalledWith({
        mappings: {
          "where are you based": {
            fieldKey: "city",
            reviewed: false,
            host: "example.org",
          },
          "work email": { fieldKey: "email", reviewed: true },
        },
      });
    });
  });

  it("reports invalid stored learning data without overwriting it", async () => {
    const chrome = new FakeBackgroundChrome();
    const storage = new FakeStorage();
    const invalidCollection = { schemaVersion: 0, value: [] };
    await storage.setItem("mappings:v1", invalidCollection);
    registerBackground(chrome, storage);
    const sendResponse = vi.fn();

    chrome.sendMessage(
      {
        type: "LEARN_EVENT",
        labelNorm: "custom",
        value: "value",
        kind: "short",
        host: "example.org",
      },
      { id: chrome.runtime.id, tab: { id: 24 } },
      sendResponse,
    );

    await vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalledWith({ error: true });
    });
    expect(await storage.getItem("mappings:v1")).toEqual(invalidCollection);
  });

  it("sends only redacted profile facts and explicitly selected job text to AI", async () => {
    const chrome = new FakeBackgroundChrome();
    const storage = new FakeStorage();
    const provider = new FakeAiProvider();
    await storage.setItem("settings:v1", {
      schemaVersion: 1,
      value: {
        provider: "openrouter",
        openrouter: { model: "test-model" },
      },
    });
    await storage.setItem("secrets:v1", { apiKey: "test-api-key" });
    await storage.setItem("profile:v1", {
      schemaVersion: 1,
      value: {
        values: {
          fullName: "Ana Exemplo",
          email: "ana@example.test",
          phone: "+55 11 99999-1111",
          city: "Recife",
          currentRole: "Analista de produto",
          cpf: "123.456.789-00",
          rg: "12.345.678-9",
          birthDate: "1990-01-01",
          address: "Rua Particular, 123",
          postalCode: "12345-678",
          gender: "não informado",
        },
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    });
    registerBackground(chrome, storage, () => provider);
    const port = new FakeBackgroundAiPort();
    port.sender = { id: chrome.runtime.id, tab: { id: 32 } };
    chrome.connect(port);

    port.send({
      type: "AI_GENERATE",
      question: "Conte sobre sua experiência — contato ana@example.test",
      language: "pt",
      selectedText:
        "Descrição da vaga\nE-mail: recrutamento@example.test\nAddress:\nRua Particular 123\nBirth date:\n1990-01-01\nResponsabilidades: liderar projetos.",
    });

    await vi.waitFor(() => {
      expect(port.events.at(-1)).toEqual({ type: "AI_DONE" });
    });
    const request = provider.requests[0];
    expect(request?.model).toBe("test-model");
    expect(request?.question).not.toContain("ana@example.test");
    expect(request?.profileContext).toContain("Ana Exemplo");
    expect(request?.profileContext).toContain("Recife");
    expect(request?.profileContext).not.toContain("ana@example.test");
    expect(request?.profileContext).not.toContain("+55 11 99999-1111");
    expect(request?.profileContext).not.toContain("123.456.789-00");
    expect(request?.profileContext).not.toContain("12.345.678-9");
    expect(request?.profileContext).not.toContain("1990-01-01");
    expect(request?.profileContext).not.toContain("Rua Particular");
    expect(request?.profileContext).not.toContain("12345-678");
    expect(request?.profileContext).not.toContain("não informado");
    expect(request?.jobContext?.selectedText).toContain("Descrição da vaga");
    expect(request?.jobContext?.selectedText).toContain("Responsabilidades");
    const payload = JSON.stringify(request);
    expect(payload).not.toContain("recrutamento@example.test");
    expect(payload).not.toContain("Rua Particular 123");
    expect(payload).not.toContain("1990-01-01");
    expect(payload).not.toContain("test-api-key");
    port.disconnect();
  });

  it("reports a friendly daily-limit code without exposing provider details", async () => {
    const chrome = new FakeBackgroundChrome();
    const storage = new FakeStorage();
    const provider = new FakeAiProvider(
      new AiProviderError("daily-limit", "private provider detail"),
    );
    await storage.setItem("settings:v1", {
      schemaVersion: 1,
      value: { provider: "openrouter", openrouter: { model: "test-model" } },
    });
    await storage.setItem("secrets:v1", { apiKey: "test-api-key" });
    registerBackground(chrome, storage, () => provider);
    const port = new FakeBackgroundAiPort();
    port.sender = { id: chrome.runtime.id, tab: { id: 33 } };
    chrome.connect(port);

    port.send({
      type: "AI_GENERATE",
      question: "Why?",
      language: "en",
    });

    await vi.waitFor(() => {
      expect(port.events).toContainEqual({ type: "AI_ERROR", code: "daily-limit" });
    });
    expect(JSON.stringify(port.events)).not.toContain("private provider detail");
    port.disconnect();
  });

  it("rejects AI ports opened by another extension", () => {
    const chrome = new FakeBackgroundChrome();
    const provider = new FakeAiProvider();
    registerBackground(chrome, new FakeStorage(), () => provider);
    const port = new FakeBackgroundAiPort();
    port.sender = { id: "another-extension", tab: { id: 34 } };

    chrome.connect(port);

    expect(port.events).toEqual([]);
    port.send({ type: "AI_GENERATE", question: "Why?", language: "en" });
    expect(provider.requests).toEqual([]);
  });

  it("accepts an AI port from an extension page", async () => {
    const chrome = new FakeBackgroundChrome();
    registerBackground(chrome, new FakeStorage());
    const port = new FakeBackgroundAiPort();
    port.sender = {
      id: chrome.runtime.id,
      url: `chrome-extension://${chrome.runtime.id}/sidepanel.html`,
    };
    chrome.connect(port);

    port.send({ type: "AI_GENERATE", question: "Why?", language: "en" });

    await vi.waitFor(() => {
      expect(port.events).toContainEqual({ type: "AI_ERROR", code: "unavailable" });
    });
    port.disconnect();
  });

  it("ignores an AI content port without a valid tab ID", () => {
    const chrome = new FakeBackgroundChrome();
    const provider = new FakeAiProvider();
    registerBackground(chrome, new FakeStorage(), () => provider);
    const port = new FakeBackgroundAiPort();
    port.sender = { id: chrome.runtime.id, tab: { id: Number.NaN } };
    chrome.connect(port);

    port.send({ type: "AI_GENERATE", question: "Why?", language: "en" });

    expect(port.events).toEqual([]);
    expect(provider.requests).toEqual([]);
  });

  it("reports AI as unavailable when no provider is configured", async () => {
    const chrome = new FakeBackgroundChrome();
    registerBackground(chrome, new FakeStorage());
    const sendResponse = vi.fn();

    chrome.sendMessage(
      { type: "AI_STATUS" },
      { id: chrome.runtime.id, tab: { id: 35 } },
      sendResponse,
    );

    await vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalledWith({ available: false });
    });
  });

  it("reports AI as unavailable when the configured provider has no key", async () => {
    const chrome = new FakeBackgroundChrome();
    const storage = new FakeStorage();
    await storage.setItem("settings:v1", {
      schemaVersion: 1,
      value: { provider: "openrouter", openrouter: { model: "test-model" } },
    });
    registerBackground(chrome, storage);
    const sendResponse = vi.fn();

    chrome.sendMessage(
      { type: "AI_STATUS" },
      { id: chrome.runtime.id, tab: { id: 36 } },
      sendResponse,
    );

    await vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalledWith({ available: false });
    });
  });

  it("reports AI as unavailable when a different provider is configured", async () => {
    const chrome = new FakeBackgroundChrome();
    const storage = new FakeStorage();
    await storage.setItem("settings:v1", {
      schemaVersion: 1,
      value: { provider: "none" },
    });
    registerBackground(chrome, storage);
    const sendResponse = vi.fn();

    chrome.sendMessage(
      { type: "AI_STATUS" },
      { id: chrome.runtime.id, tab: { id: 39 } },
      sendResponse,
    );

    await vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalledWith({ available: false });
    });
  });

  it("returns an explicit error for malformed stored AI settings", async () => {
    const chrome = new FakeBackgroundChrome();
    const storage = new FakeStorage();
    await storage.setItem("settings:v1", { schemaVersion: 0, value: {} });
    registerBackground(chrome, storage);
    const sendResponse = vi.fn();

    chrome.sendMessage(
      { type: "AI_STATUS" },
      { id: chrome.runtime.id, tab: { id: 40 } },
      sendResponse,
    );

    await vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalledWith({ error: true });
    });
  });

  it("aborts the provider signal when the AI port receives cancellation", async () => {
    const chrome = new FakeBackgroundChrome();
    const storage = new FakeStorage();
    const provider = new FakeWaitingAiProvider();
    await storage.setItem("settings:v1", {
      schemaVersion: 1,
      value: { provider: "openrouter", openrouter: { model: "test-model" } },
    });
    await storage.setItem("secrets:v1", { apiKey: "test-api-key" });
    registerBackground(chrome, storage, () => provider);
    const port = new FakeBackgroundAiPort();
    port.sender = { id: chrome.runtime.id, tab: { id: 37 } };
    chrome.connect(port);

    port.send({ type: "AI_GENERATE", question: "Why?", language: "en" });
    await vi.waitFor(() => {
      expect(provider.started).toBe(true);
    });
    port.send({ type: "AI_ABORT" });

    await vi.waitFor(() => {
      expect(provider.aborted).toBe(true);
    });
    expect(port.events).toEqual([]);
    port.disconnect();
  });

  it("rejects malformed generation commands without running the provider", async () => {
    const chrome = new FakeBackgroundChrome();
    const provider = new FakeAiProvider();
    registerBackground(chrome, new FakeStorage(), () => provider);
    const port = new FakeBackgroundAiPort();
    port.sender = { id: chrome.runtime.id, tab: { id: 38 } };
    chrome.connect(port);

    port.send({ type: "AI_GENERATE", question: "", language: "pt" });

    expect(port.events).toEqual([{ type: "AI_ERROR", code: "unavailable" }]);
    expect(provider.requests).toEqual([]);
    port.disconnect();
  });
});
