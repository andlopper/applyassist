import { expect, test as base, chromium, type BrowserContext, type Page } from "@playwright/test";
import { resolve } from "node:path";

declare global {
  interface Window {
    applyAssistSendMessage(message: unknown): Promise<unknown>;
    __applyAssistActionCounts: {
      clicks: number;
      submitEvents: number;
      submitCalls: number;
      requestSubmitCalls: number;
    };
  }
}

class FakePageRuntime {
  async sendMessage(message: unknown): Promise<unknown> {
    if (!isRecord(message) || typeof message.type !== "string") {
      throw new Error("Expected a typed runtime message.");
    }

    switch (message.type) {
      case "GET_MAPPINGS":
        return { mappings: {} };
      case "AI_STATUS":
        return { available: false };
      case "GET_FILL_VALUES":
        return {
          values: {
            fullName: "Ana Exemplo",
            email: "ana@example.test",
            salaryExpectation: "R$ 8.000",
          },
        };
      case "LEARN_EVENT":
        return { ok: true };
      default:
        throw new Error(`Unexpected runtime message type: ${message.type}`);
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

type E2eFixtures = {
  extensionContext: BrowserContext;
};

const test = base.extend<E2eFixtures>({
  extensionContext: async ({}, use) => {
    const extensionPath = resolve(process.cwd(), "dist");
    const context = await chromium.launchPersistentContext("", {
      channel: "chromium",
      headless: true,
      viewport: { width: 1280, height: 800 },
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
    });

    try {
      const serviceWorker =
        context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
      expect(serviceWorker.url()).toContain("background.js");
      await use(context);
    } finally {
      await context.close();
    }
  },
});

async function openFixture(context: BrowserContext, fixtureName: string): Promise<Page> {
  const page = await context.newPage();
  const fakeRuntime = new FakePageRuntime();

  await page.exposeFunction("applyAssistSendMessage", (message: unknown) =>
    fakeRuntime.sendMessage(message),
  );
  await page.addInitScript(() => {
    Object.defineProperty(window, "chrome", {
      configurable: true,
      value: {
        runtime: {
          sendMessage: (message: unknown) => window.applyAssistSendMessage(message),
        },
      },
    });
  });
  await page.goto(`/${fixtureName}`);
  await page.addScriptTag({ path: resolve(process.cwd(), "dist", "content.js") });
  await expect(page.getByRole("dialog")).toBeVisible();

  return page;
}

async function expectNoPageActions(page: Page): Promise<void> {
  await expect
    .poll(() => page.evaluate(() => window.__applyAssistActionCounts))
    .toEqual({ clicks: 0, submitEvents: 0, submitCalls: 0, requestSubmitCalls: 0 });
}

test("fills a simple form without clicking or submitting its controls", async ({
  extensionContext,
}) => {
  const page = await openFixture(extensionContext, "form-simple.html");

  await page.getByRole("button", { name: "Preencher prontos" }).click();

  await expect(page.getByLabel("Nome completo")).toHaveValue("Ana Exemplo");
  await expect(page.getByLabel("E-mail")).toHaveValue("ana@example.test");
  await expectNoPageActions(page);
});

test("keeps a filled React-controlled input after a component re-render", async ({
  extensionContext,
}) => {
  const page = await openFixture(extensionContext, "react-controlled.html");

  await page.getByRole("button", { name: "Preencher prontos" }).click();
  await expect(page.getByLabel("Nome completo")).toHaveValue("Ana Exemplo");
  await expect(page.getByTestId("controlled-state")).toHaveText("Ana Exemplo");
  await page.getByRole("button", { name: "Forçar re-render" }).click();
  await expect(page.getByLabel("Nome completo")).toHaveValue("Ana Exemplo");
  await expect(page.getByTestId("controlled-state")).toHaveText("Ana Exemplo");
  await expect(page.getByTestId("render-count")).toHaveText("1");
  await expectNoPageActions(page);
});

test("leaves forbidden controls and honeypot fields untouched", async ({ extensionContext }) => {
  const page = await openFixture(extensionContext, "decoy-field.html");

  await page.getByRole("button", { name: "Preencher prontos" }).click();

  await expect(page.locator("#contact-email")).toHaveValue("ana@example.test");
  await expect(page.locator("#decoy-email")).toHaveValue("");
  await expect(page.locator("#verification-code")).toHaveValue("");
  await expect(page.locator("#password")).toHaveValue("");
  await expect(page.locator("#accept-terms")).not.toBeChecked();
  await expectNoPageActions(page);
});

test("refreshes visible fields when a multi-step form advances", async ({ extensionContext }) => {
  const page = await openFixture(extensionContext, "multi-step.html");

  await page.getByRole("button", { name: "Preencher prontos" }).click();
  await expect(page.locator("#full-name")).toHaveValue("Ana Exemplo");
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(
    page.locator("#applyassist-overlay").getByText("E-mail", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Preencher prontos" }).click();

  await expect(page.locator("#email")).toHaveValue("ana@example.test");
  await expectNoPageActions(page);
});
