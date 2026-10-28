import { describe, expect, it, vi } from "vitest";
import { FakeStorage } from "../adapters/storage";
import { registerBackground, type BackgroundChrome } from "./main";
import type { MessageListener, RuntimeSender } from "./router";

class FakeBackgroundChrome implements BackgroundChrome {
  private messageListener: MessageListener | undefined;
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

  sendMessage(
    message: unknown,
    sender: RuntimeSender,
    sendResponse: (response?: unknown) => void,
  ): boolean | void {
    return this.messageListener?.(message, sender, sendResponse);
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
});
