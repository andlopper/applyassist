import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ChromeStorageRepository,
  FakeStorage,
  createChromeStorageAdapter,
  createRepository,
  exampleLegacyProfileMigration,
  isStorageItem,
  migrateStorageValue,
  STORAGE_SCHEMA_VERSION,
} from "./index";

describe("storage repository", () => {
  it("returns the fallback value when the stored payload is invalid", async () => {
    const storage = new FakeStorage();
    await storage.setItem("profile:v1", {
      schemaVersion: STORAGE_SCHEMA_VERSION,
      value: { name: "Ada", email: 42 },
    });

    const repository = new ChromeStorageRepository(
      "profile:v1",
      { name: "", email: "" },
      (value): value is { name: string; email: string } => {
        if (typeof value !== "object" || value === null) {
          return false;
        }

        const record = value as Record<string, unknown>;
        return typeof record.name === "string" && typeof record.email === "string";
      },
      exampleLegacyProfileMigration,
      storage,
    );

    await expect(repository.get()).resolves.toEqual({ name: "", email: "" });
  });

  it("migrates legacy schema versions to the current format", async () => {
    const storage = new FakeStorage();
    await storage.setItem("profile:v1", {
      schemaVersion: 0,
      name: "Ada Lovelace",
      email: "ada@example.com",
    });

    const repository = new ChromeStorageRepository(
      "profile:v1",
      { name: "", email: "" },
      (value): value is { name: string; email: string } => {
        if (typeof value !== "object" || value === null) {
          return false;
        }

        const record = value as Record<string, unknown>;
        return typeof record.name === "string" && typeof record.email === "string";
      },
      (legacy) => {
        if (typeof legacy !== "object" || legacy === null) {
          return { name: "", email: "" };
        }

        const record = legacy as Record<string, unknown>;
        return {
          name: typeof record.name === "string" ? record.name : "",
          email: typeof record.email === "string" ? record.email : "",
        };
      },
      storage,
    );

    await expect(repository.get()).resolves.toEqual({
      name: "Ada Lovelace",
      email: "ada@example.com",
    });
  });

  it("stores and clears values through the fake adapter", async () => {
    const storage = new FakeStorage();
    await storage.setItem("demo", { ok: true });

    await expect(storage.getItem("demo")).resolves.toEqual({ ok: true });

    await storage.removeItem("demo");
    await expect(storage.getItem("demo")).resolves.toBeUndefined();
  });

  it("does not use the sync storage area", () => {
    const source = readFileSync("src/adapters/storage/index.ts", "utf8");

    expect(source).not.toContain("storage.sync");
  });

  it("uses a schema versioned envelope when a repository writes a value", async () => {
    const storage = new FakeStorage();
    const repository = new ChromeStorageRepository(
      "settings:v1",
      { theme: "light", notifications: false },
      (value): value is { theme: string; notifications: boolean } => {
        if (typeof value !== "object" || value === null) {
          return false;
        }

        const record = value as Record<string, unknown>;
        return typeof record.theme === "string" && typeof record.notifications === "boolean";
      },
      (legacy) => {
        if (typeof legacy !== "object" || legacy === null) {
          return { theme: "light", notifications: false };
        }

        const record = legacy as Record<string, unknown>;
        return {
          theme: typeof record.theme === "string" ? record.theme : "light",
          notifications: typeof record.notifications === "boolean" ? record.notifications : false,
        };
      },
      storage,
    );

    await repository.set({ theme: "dark", notifications: true });

    await expect(storage.getItem("settings:v1")).resolves.toMatchObject({
      schemaVersion: STORAGE_SCHEMA_VERSION,
      value: { theme: "dark", notifications: true },
    });
  });

  it("migrateStorageValue keeps the current version intact", () => {
    const value = {
      schemaVersion: STORAGE_SCHEMA_VERSION,
      value: { theme: "dark", notifications: true },
    };

    expect(
      migrateStorageValue(value, { theme: "light", notifications: false }, () => ({ theme: "light", notifications: false })),
    ).toEqual({ theme: "dark", notifications: true });
  });

  it("exposes the adapter and migration helpers used in production", async () => {
    expect(isStorageItem({ schemaVersion: STORAGE_SCHEMA_VERSION, value: { ok: true } })).toBe(true);
    expect(isStorageItem({ value: { ok: true } })).toBe(false);
    expect(exampleLegacyProfileMigration({ name: "Ada", email: "ada@example.com" })).toEqual({
      name: "Ada",
      email: "ada@example.com",
    });

    expect(
      migrateStorageValue(undefined, { name: "" }, (legacy) => ({ name: typeof legacy === "string" ? legacy : "" })),
    ).toEqual({ name: "" });

    const adapter = createChromeStorageAdapter();
    expect(adapter).toBeInstanceOf(FakeStorage);

    const repository = createRepository(
      "profile:v1",
      { name: "", email: "" },
      (value): value is { name: string; email: string } => {
        if (typeof value !== "object" || value === null) {
          return false;
        }

        const record = value as Record<string, unknown>;
        return typeof record.name === "string" && typeof record.email === "string";
      },
      exampleLegacyProfileMigration,
      new FakeStorage(),
    );

    await repository.set({ name: "Ada", email: "ada@example.com" });
    await expect(repository.get()).resolves.toEqual({ name: "Ada", email: "ada@example.com" });
    await repository.clear();
  });
});
