export interface GenerateRequestMessage {
  question: string;
  maxLength?: number;
  language: "pt" | "en" | "es";
  model: string;
  profileContext: string;
  jobContext?: {
    title?: string;
    company?: string;
    selectedText?: string;
  };
}

export type RuntimeMessage =
  | { type: "GET_FILL_VALUES"; fieldKeys: string[]; host: string }
  | { type: "LEARN_EVENT"; labelNorm: string; value: string; kind: string; host: string }
  | { type: "GET_MAPPINGS"; host: string }
  | {
      type: "RECORD_APPLICATION";
      url: string;
      title?: string;
      company?: string;
      status: "started" | "submitted_by_user";
    }
  | ({ type: "AI_GENERATE" } & GenerateRequestMessage)
  | { type: "AI_ABORT"; requestId: string };

const CONTENT_MESSAGE_TYPES = new Set([
  "GET_FILL_VALUES",
  "LEARN_EVENT",
  "GET_MAPPINGS",
  "RECORD_APPLICATION",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

function hasOptionalStrings(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return keys.every((key) => !(key in value) || typeof value[key] === "string");
}

function isGenerateRequestMessage(value: Record<string, unknown>): boolean {
  if (
    typeof value.question !== "string" ||
    (value.maxLength !== undefined &&
      (typeof value.maxLength !== "number" ||
        !Number.isInteger(value.maxLength) ||
        value.maxLength < 0)) ||
    (value.language !== "pt" && value.language !== "en" && value.language !== "es") ||
    typeof value.model !== "string" ||
    typeof value.profileContext !== "string"
  ) {
    return false;
  }

  if (value.jobContext === undefined) {
    return true;
  }

  return (
    isRecord(value.jobContext) &&
    hasOnlyKeys(value.jobContext, ["title", "company", "selectedText"]) &&
    hasOptionalStrings(value.jobContext, ["title", "company", "selectedText"])
  );
}

export function isRuntimeMessage(value: unknown): value is RuntimeMessage {
  if (!isRecord(value) || typeof value.type !== "string") {
    return false;
  }

  switch (value.type) {
    case "GET_FILL_VALUES":
      return (
        hasOnlyKeys(value, ["type", "fieldKeys", "host"]) &&
        Array.isArray(value.fieldKeys) &&
        value.fieldKeys.every((fieldKey) => typeof fieldKey === "string") &&
        typeof value.host === "string"
      );
    case "LEARN_EVENT":
      return (
        hasOnlyKeys(value, ["type", "labelNorm", "value", "kind", "host"]) &&
        typeof value.labelNorm === "string" &&
        typeof value.value === "string" &&
        typeof value.kind === "string" &&
        typeof value.host === "string"
      );
    case "GET_MAPPINGS":
      return hasOnlyKeys(value, ["type", "host"]) && typeof value.host === "string";
    case "RECORD_APPLICATION":
      return (
        hasOnlyKeys(value, ["type", "url", "title", "company", "status"]) &&
        typeof value.url === "string" &&
        hasOptionalStrings(value, ["title", "company"]) &&
        (value.status === "started" || value.status === "submitted_by_user")
      );
    case "AI_GENERATE":
      return (
        hasOnlyKeys(value, [
          "type",
          "question",
          "maxLength",
          "language",
          "model",
          "profileContext",
          "jobContext",
        ]) && isGenerateRequestMessage(value)
      );
    case "AI_ABORT":
      return hasOnlyKeys(value, ["type", "requestId"]) && typeof value.requestId === "string";
    default:
      return false;
  }
}

export function requiresContentTab(message: RuntimeMessage): boolean {
  return CONTENT_MESSAGE_TYPES.has(message.type);
}
