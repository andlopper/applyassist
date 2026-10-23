import { normalizeLabel } from "../normalize";
import { FIELD_KEYS, type FieldKey } from "./field-key";
import { ENGLISH_SYNONYMS } from "./synonyms/en";
import { PORTUGUESE_SYNONYMS } from "./synonyms/pt";
import { SPANISH_SYNONYMS } from "./synonyms/es";

export type { FieldKey } from "./field-key";

export type ExactMatch =
  | { kind: "matched"; fieldKey: FieldKey }
  | { kind: "unknown" };

const SYNONYM_DICTIONARIES = [
  PORTUGUESE_SYNONYMS,
  ENGLISH_SYNONYMS,
  SPANISH_SYNONYMS,
] as const;

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

export function matchExactLabel(label: string): ExactMatch {
  const normalizedLabel = normalizeLabel(label);
  const fieldKey = SYNONYM_INDEX.get(normalizedLabel);

  if (!fieldKey) {
    return { kind: "unknown" };
  }

  return { kind: "matched", fieldKey };
}
