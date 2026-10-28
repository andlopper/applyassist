import { isSensitiveFieldBlocked } from "../policy";
import { normalizeLabel } from "../normalize";
import { FIELD_KEYS, type FieldKey } from "./field-key";
import { ENGLISH_SYNONYMS } from "./synonyms/en";
import { PORTUGUESE_SYNONYMS } from "./synonyms/pt";
import { SPANISH_SYNONYMS } from "./synonyms/es";

function sensitiveCategoryForFieldKey(fieldKey: FieldKey):
  | "documents"
  | "birth"
  | "address"
  | "diversity" {
  if (fieldKey === "cpf" || fieldKey === "rg") {
    return "documents";
  }
  if (fieldKey === "birthDate") {
    return "birth";
  }
  if (fieldKey === "address" || fieldKey === "postalCode") {
    return "address";
  }
  return "diversity";
}

function blockSensitiveField(
  fieldKey: FieldKey,
  settings?: Partial<Record<"documents" | "birth" | "address" | "diversity", boolean>>,
): FieldClassificationResult | undefined {
  if (!isSensitiveFieldBlocked(fieldKey, settings)) {
    return undefined;
  }

  return {
    kind: "blocked_by_setting",
    fieldKey,
    category: sensitiveCategoryForFieldKey(fieldKey),
    reason: "Sensitive field category is disabled by user settings",
  };
}

function matchesForbiddenMetadata(value: { label?: string | null; type?: string | null; autocomplete?: string | null }): boolean {
  const type = (value.type ?? "").toLowerCase();
  const autocomplete = (value.autocomplete ?? "").toLowerCase();
  const label = (value.label ?? "").toLowerCase();

  return (
    type === "password" ||
    type === "file" ||
    type === "hidden" ||
    autocomplete.startsWith("cc-") ||
    autocomplete.startsWith("current-password") ||
    autocomplete.startsWith("new-password") ||
    autocomplete.startsWith("one-time-code") ||
    label.includes("password") ||
    label.includes("senha") ||
    label.includes("cartao") ||
    label.includes("cvv") ||
    label.includes("otp") ||
    label.includes("captcha")
  );
}

export type { FieldKey } from "./field-key";

export type ExactMatch =
  | { kind: "matched"; fieldKey: FieldKey }
  | { kind: "unknown" };

export type ApproximateMatch =
  | { kind: "matched" | "uncertain"; fieldKey: FieldKey; score: number }
  | { kind: "unknown"; score: number };

export type LearnedMapping = {
  fieldKey: FieldKey;
  reviewed: boolean;
  host?: string;
};

export type FieldClassificationResult =
  | {
      kind: "ready" | "uncertain";
      fieldKey: FieldKey;
      confidence: number;
      reason: string;
    }
  | {
      kind: "open_text";
      confidence: number;
      reason: string;
    }
  | {
      kind: "unknown";
      confidence: number;
      reason: string;
    }
  | {
      kind: "forbidden";
      reason: string;
    }
  | {
      kind: "blocked_by_setting";
      fieldKey: FieldKey;
      category: "documents" | "birth" | "address" | "diversity";
      reason: string;
    };

export type ClassifyFieldLabelInput = {
  label?: string;
  type?: string;
  autocomplete?: string;
  maxlength?: number;
  host?: string;
  learnedMappings?: Record<string, LearnedMapping | undefined>;
  metadata?: {
    type?: string | null;
    autocomplete?: string | null;
    name?: string | null;
    id?: string | null;
    label?: string | null;
    insideForbiddenProviderFrame?: boolean;
  };
  settings?: Partial<Record<"documents" | "birth" | "address" | "diversity", boolean>>;
};

const SYNONYM_DICTIONARIES = [
  PORTUGUESE_SYNONYMS,
  ENGLISH_SYNONYMS,
  SPANISH_SYNONYMS,
] as const;

const READY_THRESHOLD = 0.9;
const UNCERTAIN_THRESHOLD = 0.7;
const TOKEN_SIMILARITY_THRESHOLD = 0.7;

function createSynonymIndex(): ReadonlyMap<string, FieldKey> {
  const index = new Map<string, FieldKey>();

  for (const dictionary of SYNONYM_DICTIONARIES) {
    for (const fieldKey of FIELD_KEYS) {
      for (const synonym of dictionary[fieldKey]) {
        const existingFieldKey = index.get(synonym);
        if (existingFieldKey && existingFieldKey !== fieldKey) {
          throw new Error(
            `Synonym "${synonym}" maps to both "${existingFieldKey}" and "${fieldKey}"`,
          );
        }

        index.set(synonym, fieldKey);
      }
    }
  }

  return index;
}

const SYNONYM_INDEX = createSynonymIndex();

const AUTOCOMPLETE_FIELD_KEYS: Readonly<Record<string, FieldKey>> = {
  "given-name": "firstName",
  "family-name": "lastName",
  name: "fullName",
  email: "email",
  "tel": "phone",
  "tel-national": "phone",
  "address-level2": "city",
  "address-level1": "state",
  "country-name": "country",
  url: "portfolioUrl",
  bday: "birthDate",
  "street-address": "address",
  "postal-code": "postalCode",
};

const OPEN_TEXT_PATTERNS = [
  "porque",
  "por que",
  "conte",
  "descreva",
  "explique",
  "fale",
  "motivation",
  "motivacao",
  "cover letter",
  "tell us",
  "describe",
  "why",
  "why do",
  "we would like to know",
  "cuentanos",
  "cuentame",
] as const;

function levenshteinSimilarity(left: string, right: string): number {
  const maxLength = Math.max(left.length, right.length);
  if (maxLength === 0) {
    return 1;
  }

  let previousRow = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const currentRow = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitutionCost =
        left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      currentRow[rightIndex] = Math.min(
        (previousRow[rightIndex] ?? 0) + 1,
        (currentRow[rightIndex - 1] ?? 0) + 1,
        (previousRow[rightIndex - 1] ?? 0) + substitutionCost,
      );
    }
    previousRow = currentRow;
  }

  return 1 - (previousRow[right.length] ?? maxLength) / maxLength;
}

function diceTokenSimilarity(left: string, right: string): number {
  const leftTokens = [...new Set(left.split(" "))];
  const rightTokens = [...new Set(right.split(" "))];

  if (leftTokens.length === 1 && rightTokens.length === 1) {
    return levenshteinSimilarity(leftTokens[0] ?? "", rightTokens[0] ?? "");
  }

  const pairs: { leftIndex: number; rightIndex: number; score: number }[] = [];
  for (const [leftIndex, leftToken] of leftTokens.entries()) {
    for (const [rightIndex, rightToken] of rightTokens.entries()) {
      const score = levenshteinSimilarity(leftToken, rightToken);
      if (score >= TOKEN_SIMILARITY_THRESHOLD) {
        pairs.push({ leftIndex, rightIndex, score });
      }
    }
  }
  pairs.sort((first, second) => second.score - first.score);

  const matchedLeft = new Set<number>();
  const matchedRight = new Set<number>();
  let matchedSimilarity = 0;
  for (const pair of pairs) {
    if (matchedLeft.has(pair.leftIndex) || matchedRight.has(pair.rightIndex)) {
      continue;
    }

    matchedLeft.add(pair.leftIndex);
    matchedRight.add(pair.rightIndex);
    matchedSimilarity += pair.score;
  }

  return (2 * matchedSimilarity) / (leftTokens.length + rightTokens.length);
}

export function matchExactLabel(label: string): ExactMatch {
  const normalizedLabel = normalizeLabel(label);
  const fieldKey = SYNONYM_INDEX.get(normalizedLabel);

  if (!fieldKey) {
    return { kind: "unknown" };
  }

  return { kind: "matched", fieldKey };
}

export function matchApproximateLabel(label: string): ApproximateMatch {
  const normalizedLabel = normalizeLabel(label);
  if (!normalizedLabel) {
    return { kind: "unknown", score: 0 };
  }

  let bestScore = 0;
  let bestFieldKey: FieldKey | undefined;
  let ambiguous = false;

  for (const [synonym, fieldKey] of SYNONYM_INDEX) {
    const score = diceTokenSimilarity(normalizedLabel, synonym);
    if (score > bestScore) {
      bestScore = score;
      bestFieldKey = fieldKey;
      ambiguous = false;
    } else if (score === bestScore && fieldKey !== bestFieldKey) {
      ambiguous = true;
    }
  }

  if (!bestFieldKey || ambiguous || bestScore < UNCERTAIN_THRESHOLD) {
    return { kind: "unknown", score: bestScore };
  }

  if (bestScore >= READY_THRESHOLD) {
    return { kind: "matched", fieldKey: bestFieldKey, score: bestScore };
  }

  return { kind: "uncertain", fieldKey: bestFieldKey, score: bestScore };
}

function isLikelyOpenText({
  label,
  type,
  maxlength,
}: Pick<ClassifyFieldLabelInput, "label" | "type" | "maxlength">): boolean {
  if (!label) {
    return false;
  }

  const normalizedLabel = normalizeLabel(label);
  if (type && type.toLowerCase() === "textarea") {
    return true;
  }

  if (typeof maxlength === "number" && maxlength >= 200) {
    return true;
  }

  if (!normalizedLabel) {
    return false;
  }

  return OPEN_TEXT_PATTERNS.some((pattern) => normalizedLabel.includes(pattern));
}

export function classifyFieldLabel({
  label = "",
  type,
  autocomplete,
  maxlength,
  host,
  learnedMappings,
  metadata,
  settings,
}: ClassifyFieldLabelInput): FieldClassificationResult {
  const normalizedLabel = normalizeLabel(label);

  const directMetadata = metadata ?? {
    type,
    autocomplete,
    label,
  };

  const forbiddenEvaluation = directMetadata;
  const forbiddenResult =
    forbiddenEvaluation &&
    typeof forbiddenEvaluation === "object" &&
    "label" in forbiddenEvaluation ?
      (forbiddenEvaluation as { label?: string | null; type?: string | null; autocomplete?: string | null })
    : undefined;

  if (forbiddenResult && matchesForbiddenMetadata(forbiddenResult)) {
    return { kind: "forbidden", reason: "Field contains a forbidden pattern" };
  }

  if (autocomplete) {
    const normalizedAutocomplete = normalizeLabel(autocomplete);
    const fieldKey = AUTOCOMPLETE_FIELD_KEYS[normalizedAutocomplete];
    if (fieldKey) {
      const blocked = blockSensitiveField(fieldKey, settings);
      if (blocked) {
        return blocked;
      }

      return {
        kind: "ready",
        fieldKey,
        confidence: 0.95,
        reason: "Autocomplete match",
      };
    }
  }

  if (learnedMappings) {
    const normalizedHost = host ? host.toLowerCase() : undefined;
    const sameHostEntry = normalizedHost
      ? Object.entries(learnedMappings).find(([key, mapping]) => {
          if (!mapping) {
            return false;
          }
          return key === normalizedLabel && mapping.host?.toLowerCase() === normalizedHost;
        })
      : undefined;

    const entry = sameHostEntry
      ? sameHostEntry[1]
      : learnedMappings[normalizedLabel] ??
        Object.entries(learnedMappings).find(([key, mapping]) => {
          if (!mapping) {
            return false;
          }
          return key === normalizedLabel;
        })?.[1];

    if (entry) {
      if (entry.reviewed) {
        return {
          kind: "ready",
          fieldKey: entry.fieldKey,
          confidence: 0.97,
          reason: "Learned mapping reviewed",
        };
      }

      return {
        kind: "uncertain",
        fieldKey: entry.fieldKey,
        confidence: 0.8,
        reason: "Learned mapping requires review",
      };
    }
  }

  const exactMatch = matchExactLabel(label);
  if (exactMatch.kind === "matched") {
    const fieldKey = exactMatch.fieldKey;
    const blocked = blockSensitiveField(fieldKey, settings);
    if (blocked) {
      return blocked;
    }

    return {
      kind: "ready",
      fieldKey,
      confidence: 1,
      reason: "Exact synonym match",
    };
  }

  const approximateMatch = matchApproximateLabel(label);
  if (approximateMatch.kind === "matched") {
    const fieldKey = approximateMatch.fieldKey;
    const blocked = blockSensitiveField(fieldKey, settings);
    if (blocked) {
      return blocked;
    }

    return {
      kind: "ready",
      fieldKey,
      confidence: approximateMatch.score,
      reason: "Approximate match",
    };
  }

  if (approximateMatch.kind === "uncertain") {
    const fieldKey = approximateMatch.fieldKey;
    const blocked = blockSensitiveField(fieldKey, settings);
    if (blocked) {
      return blocked;
    }

    return {
      kind: "uncertain",
      fieldKey,
      confidence: approximateMatch.score,
      reason: "Approximate match below ready threshold",
    };
  }

  if (isLikelyOpenText({ label, type, maxlength })) {
    return {
      kind: "open_text",
      confidence: 0.8,
      reason: "Likely open-ended question or textarea",
    };
  }

  return {
    kind: "unknown",
    confidence: 0,
    reason: "No reliable field match",
  };
}
