import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, normalizeSettings } from "./types";

describe("settings defaults and validation", () => {
  it("provides disabled-by-default sensitive categories", () => {
    expect(DEFAULT_SETTINGS.sensitiveEnabled).toEqual({
      documents: false,
      birth: false,
      address: false,
      diversity: false,
    });
    expect(DEFAULT_SETTINGS.provider).toBe("none");
  });

  it("returns a safe default payload when input is malformed", () => {
    expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings({ sensitiveEnabled: { documents: true }, provider: "ollama" })).toEqual({
      sensitiveEnabled: {
        documents: true,
        birth: false,
        address: false,
        diversity: false,
      },
      provider: "ollama",
      openrouter: {},
      siteOverrides: {},
      debug: false,
    });
  });

  it("normalizes invalid settings values to safe defaults", () => {
    expect(
      normalizeSettings({
        sensitiveEnabled: { documents: true },
        provider: "openrouter",
        openrouter: { model: "gpt-4o-mini" },
        siteOverrides: { "example.com": "allow", bad: "invalid" },
        debug: true,
      }),
    ).toEqual({
      sensitiveEnabled: {
        documents: true,
        birth: false,
        address: false,
        diversity: false,
      },
      provider: "openrouter",
      openrouter: { model: "gpt-4o-mini" },
      siteOverrides: { "example.com": "allow" },
      debug: true,
    });
  });
});
