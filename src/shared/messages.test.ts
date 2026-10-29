import { describe, expect, it } from "vitest";
import {
  isAiGenerationPortCommand,
  isRuntimeMessage,
  requiresContentTab,
  type RuntimeMessage,
} from "./messages";

describe("runtime message schemas", () => {
  it.each([
    ["fill values", { type: "GET_FILL_VALUES", fieldKeys: ["email"], host: "example.org" }],
    [
      "learning event",
      {
        type: "LEARN_EVENT",
        labelNorm: "name",
        value: "Ada",
        kind: "short",
        fieldKey: "fullName",
        host: "example.org",
      },
    ],
    ["mappings", { type: "GET_MAPPINGS", host: "example.org" }],
    [
      "new application",
      { type: "RECORD_APPLICATION", url: "https://example.org/job", status: "started" },
    ],
    [
      "submitted application",
      {
        type: "RECORD_APPLICATION",
        url: "https://example.org/job",
        title: "Engineer",
        company: "Example",
        status: "submitted_by_user",
      },
    ],
    ["AI status", { type: "AI_STATUS" }],
  ] as const)("accepts the %s schema", (_name, message) => {
    expect(isRuntimeMessage(message)).toBe(true);
  });

  it.each([
    null,
    [],
    "GET_MAPPINGS",
    {},
    { type: "GET_FILL_VALUES", fieldKeys: ["email"] },
    { type: "GET_FILL_VALUES", fieldKeys: [1], host: "example.org" },
    { type: "GET_FILL_VALUES", fieldKeys: [], host: "example.org", extra: true },
    { type: "LEARN_EVENT", labelNorm: "name", value: "Ada", kind: 1, host: "example.org" },
    { type: "LEARN_EVENT", labelNorm: "name", value: "Ada", kind: "text", host: "example.org" },
    { type: "LEARN_EVENT", labelNorm: "name", value: "Ada", kind: "short", fieldKey: "not-a-field", host: "example.org" },
    { type: "GET_MAPPINGS", host: 42 },
    { type: "RECORD_APPLICATION", url: "https://example.org", status: "unknown" },
    { type: "RECORD_APPLICATION", url: "https://example.org", title: 1, status: "started" },
    { type: "RECORD_APPLICATION", url: "https://example.org", status: "started", extra: true },
    { type: "UNRECOGNIZED", host: "example.org" },
  ])("rejects malformed runtime messages", (message) => {
    expect(isRuntimeMessage(message)).toBe(false);
  });

  it("distinguishes content messages from extension-page requests", () => {
    const contentMessage: RuntimeMessage = {
      type: "GET_MAPPINGS",
      host: "example.org",
    };
    const aiStatusMessage: RuntimeMessage = { type: "AI_STATUS" };

    expect(requiresContentTab(contentMessage)).toBe(true);
    expect(requiresContentTab(aiStatusMessage)).toBe(true);
  });

  it("accepts only safe, user-triggered AI port commands", () => {
    expect(
      isAiGenerationPortCommand({
        type: "AI_GENERATE",
        question: "Why are you interested?",
        language: "en",
        selectedText: "User-selected job description",
      }),
    ).toBe(true);
    expect(isAiGenerationPortCommand({ type: "AI_ABORT" })).toBe(true);
    expect(
      isAiGenerationPortCommand({
        type: "AI_GENERATE",
        question: "Why?",
        language: "pt",
        profileContext: "must not come from content",
      }),
    ).toBe(false);
    expect(isAiGenerationPortCommand({ type: "AI_GENERATE", question: "", language: "pt" })).toBe(
      false,
    );
  });
});
