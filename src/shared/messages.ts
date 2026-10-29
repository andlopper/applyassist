import { FIELD_KEYS, type FieldKey } from "../core/matching/field-key";

export interface AiGenerationCommand {
  type: "AI_GENERATE";
  question: string;
  language: "pt" | "en" | "es";
  maxLength?: number;
  selectedText?: string;
}

export type AiGenerationPortCommand = AiGenerationCommand | { type: "AI_ABORT" };

export type AiGenerationPortEvent =
  | { type: "AI_CHUNK"; text: string }
  | { type: "AI_DONE" }
  | { type: "AI_CANCELLED" }
  | { type: "AI_ERROR"; code: "daily-limit" | "unavailable" };

export type RuntimeMessage =
  | { type: "GET_FILL_VALUES"; fieldKeys: string[]; host: string }
  | {
      type: "LEARN_EVENT";
      labelNorm: string;
      value: string;
      kind: "short" | "open_text";
      fieldKey?: FieldKey;
      host: string;
    }
  | { type: "GET_MAPPINGS"; host: string }
    | {
        type: "RECORD_APPLICATION";
        url: string;
        title?: string;
        company?: string;
        status: "started" | "submitted_by_user";
      }
    | { type: "AI_STATUS" };

const CONTENT_MESSAGE_TYPES = new Set([
  "GET_FILL_VALUES",
  "LEARN_EVENT",
  "GET_MAPPINGS",
  "RECORD_APPLICATION",
  "AI_STATUS",
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

function isFieldKey(value: unknown): value is FieldKey {
  return typeof value === "string" && FIELD_KEYS.some((fieldKey) => fieldKey === value);
}

export function isAiGenerationPortCommand(value: unknown): value is AiGenerationPortCommand {
  if (!isRecord(value) || typeof value.type !== "string") {
    return false;
  }
  if (value.type === "AI_ABORT") {
    return hasOnlyKeys(value, ["type"]);
  }
  if (
    value.type !== "AI_GENERATE" ||
    !hasOnlyKeys(value, ["type", "question", "language", "maxLength", "selectedText"]) ||
    typeof value.question !== "string" ||
    value.question.trim().length === 0 ||
    (value.language !== "pt" && value.language !== "en" && value.language !== "es") ||
    (value.maxLength !== undefined &&
      (typeof value.maxLength !== "number" ||
        !Number.isInteger(value.maxLength) ||
        value.maxLength < 0)) ||
    (value.selectedText !== undefined && typeof value.selectedText !== "string")
  ) {
    return false;
  }
  return true;
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
        hasOnlyKeys(value, ["type", "labelNorm", "value", "kind", "fieldKey", "host"]) &&
        typeof value.labelNorm === "string" &&
        typeof value.value === "string" &&
        (value.kind === "short" || value.kind === "open_text") &&
        (value.fieldKey === undefined || isFieldKey(value.fieldKey)) &&
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
    case "AI_STATUS":
      return hasOnlyKeys(value, ["type"]);
    default:
      return false;
  }
}

export function requiresContentTab(message: RuntimeMessage): boolean {
  return CONTENT_MESSAGE_TYPES.has(message.type);
}
