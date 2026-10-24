import { describe, expect, it } from "vitest";
import { isRuntimeMessage, requiresContentTab, type RuntimeMessage } from "./messages";

describe("runtime message schemas", () => {
  it.each([
    ["fill values", { type: "GET_FILL_VALUES", fieldKeys: ["email"], host: "example.org" }],
    [
      "learning event",
      { type: "LEARN_EVENT", labelNorm: "name", value: "Ada", kind: "text", host: "example.org" },
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
    [
      "AI request",
      { type: "AI_GENERATE", question: "Why?", language: "pt", model: "model", profileContext: "" },
    ],
    [
      "AI request with contexts",
      {
        type: "AI_GENERATE",
        question: "Why?",
        maxLength: 200,
        language: "en",
        model: "model",
        profileContext: "Context",
        jobContext: { title: "Engineer", company: "Example", selectedText: "Description" },
      },
    ],
    ["AI abort", { type: "AI_ABORT", requestId: "request-1" }],
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
    { type: "GET_MAPPINGS", host: 42 },
    { type: "RECORD_APPLICATION", url: "https://example.org", status: "unknown" },
    { type: "RECORD_APPLICATION", url: "https://example.org", title: 1, status: "started" },
    { type: "RECORD_APPLICATION", url: "https://example.org", status: "started", extra: true },
    { type: "AI_GENERATE", question: "Why?", language: "pt", model: "m" },
    {
      type: "AI_GENERATE",
      question: "Why?",
      maxLength: -1,
      language: "pt",
      model: "m",
      profileContext: "",
    },
    {
      type: "AI_GENERATE",
      question: "Why?",
      maxLength: 2.5,
      language: "pt",
      model: "m",
      profileContext: "",
    },
    {
      type: "AI_GENERATE",
      question: "Why?",
      maxLength: "long",
      language: "pt",
      model: "m",
      profileContext: "",
    },
    {
      type: "AI_GENERATE",
      question: "Why?",
      language: "fr",
      model: "m",
      profileContext: "",
    },
    {
      type: "AI_GENERATE",
      question: "Why?",
      language: "es",
      model: "m",
      profileContext: "",
      jobContext: null,
    },
    {
      type: "AI_GENERATE",
      question: "Why?",
      language: "es",
      model: "m",
      profileContext: "",
      jobContext: { selectedText: 7 },
    },
    {
      type: "AI_GENERATE",
      question: "Why?",
      language: "es",
      model: "m",
      profileContext: "",
      unexpected: "field",
    },
    { type: "AI_ABORT", requestId: 7 },
    { type: "UNRECOGNIZED", host: "example.org" },
  ])("rejects malformed runtime messages", (message) => {
    expect(isRuntimeMessage(message)).toBe(false);
  });

  it("distinguishes content messages from extension-page requests", () => {
    const contentMessage: RuntimeMessage = {
      type: "GET_MAPPINGS",
      host: "example.org",
    };
    const sidePanelMessage: RuntimeMessage = {
      type: "AI_ABORT",
      requestId: "request-1",
    };

    expect(requiresContentTab(contentMessage)).toBe(true);
    expect(requiresContentTab(sidePanelMessage)).toBe(false);
  });
});
