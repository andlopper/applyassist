import { isForbiddenField, isSensitiveFieldBlocked } from "../policy";
import { FIELD_KEYS, type FieldKey } from "../matching/field-key";
import { normalizeLabel } from "../normalize";

export interface LearnedMapping {
  labelNorm: string;
  fieldKey: FieldKey;
  reviewed: boolean;
  hits: number;
  lastSeen: string;
  host?: string;
}

export interface AnswerMemory {
  labelNorm: string;
  answer: string;
  scope: "host" | "job";
  host: string;
  jobKey?: string;
  reviewed: boolean;
  createdAt: string;
}

export interface LearningConflict {
  fieldKey: FieldKey;
  stored: string;
  seen: string;
  host: string;
  createdAt: string;
}

export interface LearningState {
  mappings: LearnedMapping[];
  answers: AnswerMemory[];
  conflicts: LearningConflict[];
}

export interface LearningEvent {
  labelNorm: string;
  value: string;
  kind: "short" | "open_text";
  host: string;
  fieldKey?: FieldKey;
  jobKey?: string;
  now: string;
  profile: Partial<Record<FieldKey, string>>;
}

export type LearningOutcome =
  | { kind: "mapping" | "answer" | "conflict"; state: LearningState }
  | { kind: "ignored"; reason: "empty" | "forbidden" | "sensitive" | "unchanged"; state: LearningState };

function ignored(
  state: LearningState,
  reason: Extract<LearningOutcome, { kind: "ignored" }>["reason"],
): LearningOutcome {
  return { kind: "ignored", reason, state };
}

export function learnFromEvent(event: LearningEvent, state: LearningState): LearningOutcome {
  const labelNorm = normalizeLabel(event.labelNorm);
  const valueNorm = normalizeLabel(event.value);
  if (!labelNorm || !valueNorm || !event.value.trim()) {
    return ignored(state, "empty");
  }

  if (isForbiddenField(event.labelNorm)) {
    return ignored(state, "forbidden");
  }

  if (event.fieldKey && isSensitiveFieldBlocked(event.fieldKey)) {
    return ignored(state, "sensitive");
  }

  if (event.fieldKey) {
    const stored = event.profile[event.fieldKey];
    if (typeof stored === "string" && event.value !== stored) {
      const conflict: LearningConflict = {
        fieldKey: event.fieldKey,
        stored,
        seen: event.value,
        host: event.host,
        createdAt: event.now,
      };
      const existingIndex = state.conflicts.findIndex(
        (existing) =>
          existing.fieldKey === conflict.fieldKey &&
          existing.stored === conflict.stored &&
          existing.seen === conflict.seen &&
          existing.host === conflict.host,
      );
      const conflicts = [...state.conflicts];
      if (existingIndex >= 0) {
        conflicts[existingIndex] = conflict;
      } else {
        conflicts.push(conflict);
      }
      return {
        kind: "conflict",
        state: {
          ...state,
          conflicts,
        },
      };
    }

    if (stored === event.value) {
      return ignored(state, "unchanged");
    }
  } else {
    const matches = FIELD_KEYS.filter((fieldKey) => {
      const profileValue = event.profile[fieldKey];
      return (
        typeof profileValue === "string" &&
        profileValue.trim().length > 0 &&
        normalizeLabel(profileValue) === valueNorm
      );
    });
    if (matches.some((fieldKey) => isSensitiveFieldBlocked(fieldKey))) {
      return ignored(state, "sensitive");
    }
    if (matches.length === 1) {
      const fieldKey = matches[0];
      if (fieldKey) {
        const existingIndex = state.mappings.findIndex(
          (mapping) =>
            mapping.labelNorm === labelNorm &&
            mapping.host === event.host &&
            mapping.fieldKey === fieldKey,
        );
        const existingMapping =
          existingIndex >= 0 ? state.mappings[existingIndex] : undefined;
        const mapping: LearnedMapping = {
          labelNorm,
          fieldKey,
          reviewed: false,
          hits: (existingMapping?.hits ?? 0) + 1,
          lastSeen: event.now,
          host: event.host,
        };
        const mappings = [...state.mappings];
        if (existingIndex >= 0) {
          mappings[existingIndex] = mapping;
        } else if (
          state.mappings.some(
            (existing) => existing.labelNorm === labelNorm && existing.host === event.host,
          )
        ) {
          return ignored(state, "unchanged");
        } else {
          mappings.push(mapping);
        }
        return { kind: "mapping", state: { ...state, mappings } };
      }
    }
  }

  const scope = event.kind === "open_text" ? "job" : "host";
  const answer: AnswerMemory = {
    labelNorm,
    answer: event.value,
    scope,
    host: event.host,
    ...(scope === "job" && event.jobKey ? { jobKey: event.jobKey } : {}),
    reviewed: false,
    createdAt: event.now,
  };
  const duplicate = state.answers.some(
    (existing) =>
      existing.labelNorm === answer.labelNorm &&
      existing.answer === answer.answer &&
      existing.scope === answer.scope &&
      existing.host === answer.host &&
      existing.jobKey === answer.jobKey,
  );
  if (duplicate) {
    return ignored(state, "unchanged");
  }
  return {
    kind: "answer",
    state: { ...state, answers: [...state.answers, answer] },
  };
}
