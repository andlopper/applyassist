import { normalizeLabel } from "../normalize";
import { FIELD_KEYS, type FieldKey } from "./field-key";
import { ENGLISH_SYNONYMS } from "./synonyms/en";
import { PORTUGUESE_SYNONYMS } from "./synonyms/pt";
import { SPANISH_SYNONYMS } from "./synonyms/es";

export type { FieldKey } from "./field-key";

export type ExactMatch =
  | { kind: "matched"; fieldKey: FieldKey }
  | { kind: "unknown" };

export type ApproximateMatch =
  | { kind: "matched" | "uncertain"; fieldKey: FieldKey; score: number }
  | { kind: "unknown"; score: number };

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
