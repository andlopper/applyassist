import { describe, expect, it } from "vitest";
import { learnFromEvent, type LearningState } from "./index";

const EMPTY_STATE: LearningState = {
  mappings: [],
  answers: [],
  conflicts: [],
};

const PROFILE = {
  fullName: "Ada Lovelace",
  email: "ada@example.test",
  city: "Recife",
};

describe("learning engine", () => {
  it.each([
    ["pt-BR", "E-mail"],
    ["English", "Email address"],
    ["español", "Correo electrónico"],
  ])("creates a conflict for a known %s field with a different value", (_language, labelNorm) => {
    const outcome = learnFromEvent(
      {
        labelNorm,
        value: "different@example.test",
        host: "example.org",
        kind: "short",
        fieldKey: "email",
        now: "2026-01-01T00:00:00.000Z",
        profile: PROFILE,
      },
      EMPTY_STATE,
    );

    expect(outcome.kind).toBe("conflict");
    expect(outcome.state.conflicts).toEqual([
      {
        fieldKey: "email",
        stored: "ada@example.test",
        seen: "different@example.test",
        host: "example.org",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ]);
  });

  it("creates an unreviewed mapping when a short unknown label exactly matches one profile value", () => {
    const outcome = learnFromEvent(
      {
        labelNorm: "Correo electrónico",
        value: " ada@example.test ",
        host: "example.org",
        kind: "short",
        now: "2026-01-01T00:00:00.000Z",
        profile: PROFILE,
      },
      EMPTY_STATE,
    );

    expect(outcome.kind).toBe("mapping");
    expect(outcome.state.mappings).toEqual([
      {
        labelNorm: "correo electronico",
        fieldKey: "email",
        reviewed: false,
        hits: 1,
        lastSeen: "2026-01-01T00:00:00.000Z",
        host: "example.org",
      },
    ]);
    expect(outcome.state.answers).toEqual([]);
  });

  it("matches profile values after accent and repeated-whitespace normalization", () => {
    const outcome = learnFromEvent(
      {
        labelNorm: "Cidade alternativa",
        value: "  Sao   Paulo ",
        host: "example.org",
        kind: "short",
        now: "2026-01-01T00:00:00.000Z",
        profile: { city: "São Paulo" },
      },
      EMPTY_STATE,
    );

    expect(outcome.kind).toBe("mapping");
    expect(outcome.state.mappings[0]?.fieldKey).toBe("city");
  });

  it("stores an answer instead of mapping a value shared by multiple profile fields", () => {
    const outcome = learnFromEvent(
      {
        labelNorm: "Nome preferido",
        value: "Recife",
        host: "example.org",
        kind: "short",
        now: "2026-01-01T00:00:00.000Z",
        profile: { city: "Recife", country: "Recife" },
      },
      EMPTY_STATE,
    );

    expect(outcome.kind).toBe("answer");
    expect(outcome.state.mappings).toEqual([]);
    expect(outcome.state.answers).toEqual([
      {
        labelNorm: "nome preferido",
        answer: "Recife",
        scope: "host",
        host: "example.org",
        reviewed: false,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ]);
  });

  it("stores open-ended answers as job-scoped and does not create conflicts for matching profile values", () => {
    const openAnswer = learnFromEvent(
      {
        labelNorm: "Descreva sua experiência",
        value: "Worked in product teams",
        host: "example.org",
        kind: "open_text",
        now: "2026-01-01T00:00:00.000Z",
        profile: PROFILE,
      },
      EMPTY_STATE,
    );
    const unchanged = learnFromEvent(
      {
        labelNorm: "E-mail",
        value: "ada@example.test",
        host: "example.org",
        kind: "short",
        fieldKey: "email",
        now: "2026-01-01T00:00:00.000Z",
        profile: PROFILE,
      },
      EMPTY_STATE,
    );

    expect(openAnswer.state.answers[0]?.scope).toBe("job");
    expect(unchanged.kind).toBe("ignored");
    expect(unchanged.state.conflicts).toEqual([]);
  });

  it("keeps a job key on open-ended memories and deduplicates identical answers", () => {
    const event = {
      labelNorm: "Describe your goals",
      value: "Build useful products",
      host: "example.org",
      kind: "open_text" as const,
      jobKey: "example.org/jobs/42",
      now: "2026-01-01T00:00:00.000Z",
      profile: PROFILE,
    };
    const first = learnFromEvent(event, EMPTY_STATE);
    const second = learnFromEvent(event, first.state);

    expect(first.state.answers[0]?.jobKey).toBe("example.org/jobs/42");
    expect(second.kind).toBe("ignored");
    expect(second.state.answers).toHaveLength(1);
  });

  it("stores unmatched known-field answers as host-scoped memories", () => {
    const outcome = learnFromEvent(
      {
        labelNorm: "City",
        value: "Lisbon",
        host: "example.org",
        kind: "short",
        fieldKey: "city",
        now: "2026-01-01T00:00:00.000Z",
        profile: {},
      },
      EMPTY_STATE,
    );

    expect(outcome.kind).toBe("answer");
    expect(outcome.state.answers[0]?.scope).toBe("host");
  });

  it("does not overwrite a mapping that already points to a different field", () => {
    const state: LearningState = {
      ...EMPTY_STATE,
      mappings: [
        {
          labelNorm: "custom label",
          fieldKey: "fullName",
          reviewed: true,
          hits: 3,
          lastSeen: "2025-12-31T00:00:00.000Z",
          host: "example.org",
        },
      ],
    };
    const outcome = learnFromEvent(
      {
        labelNorm: "Custom label",
        value: "ada@example.test",
        host: "example.org",
        kind: "short",
        now: "2026-01-01T00:00:00.000Z",
        profile: PROFILE,
      },
      state,
    );

    expect(outcome.kind).toBe("ignored");
    expect(outcome.state.mappings).toEqual(state.mappings);
  });

  it("updates an existing conflict instead of duplicating it", () => {
    const event = {
      labelNorm: "Email",
      value: "new@example.test",
      host: "example.org",
      kind: "short" as const,
      fieldKey: "email" as const,
      now: "2026-01-01T00:00:00.000Z",
      profile: PROFILE,
    };
    const first = learnFromEvent(event, EMPTY_STATE);
    const second = learnFromEvent(
      { ...event, now: "2026-01-02T00:00:00.000Z" },
      first.state,
    );

    expect(second.kind).toBe("conflict");
    expect(second.state.conflicts).toHaveLength(1);
    expect(second.state.conflicts[0]?.createdAt).toBe("2026-01-02T00:00:00.000Z");
  });

  it.each([
    ["empty values", { labelNorm: "custom", value: "   ", kind: "short" as const }],
    ["password labels", { labelNorm: "Password", value: "secret", kind: "short" as const }],
    ["OTP labels", { labelNorm: "Código OTP", value: "123456", kind: "short" as const }],
    ["sensitive fields", { labelNorm: "Document", value: "value", kind: "short" as const, fieldKey: "cpf" as const }],
    ["sensitive profile values", { labelNorm: "Document", value: "12345678900", kind: "short" as const }],
    ["labels with no normalized tokens", { labelNorm: "---", value: "answer", kind: "short" as const }],
  ])("does not learn %s", (_name, event) => {
    const outcome = learnFromEvent(
      {
        ...event,
        host: "example.org",
        now: "2026-01-01T00:00:00.000Z",
        profile:
          event.value === "12345678900"
            ? { ...PROFILE, cpf: "12345678900" }
            : PROFILE,
      },
      EMPTY_STATE,
    );

    expect(outcome.kind).toBe("ignored");
    expect(outcome.state).toEqual(EMPTY_STATE);
  });

  it("updates matching unreviewed mappings without overwriting their field key", () => {
    const existingState: LearningState = {
      ...EMPTY_STATE,
      mappings: [
        {
          labelNorm: "email contact",
          fieldKey: "email",
          reviewed: false,
          hits: 2,
          lastSeen: "2025-12-31T00:00:00.000Z",
          host: "example.org",
        },
      ],
    };
    const outcome = learnFromEvent(
      {
        labelNorm: "Email contact",
        value: "ada@example.test",
        host: "example.org",
        kind: "short",
        now: "2026-01-01T00:00:00.000Z",
        profile: PROFILE,
      },
      existingState,
    );

    expect(outcome.kind).toBe("mapping");
    expect(outcome.state.mappings[0]).toMatchObject({
      fieldKey: "email",
      reviewed: false,
      hits: 3,
      lastSeen: "2026-01-01T00:00:00.000Z",
    });
  });

  it("normalizes accent marks and repeated whitespace for long labels", () => {
    const longLabel = `  Qual é o seu e-mail   ${"x".repeat(300)} `;
    const outcome = learnFromEvent(
      {
        labelNorm: longLabel,
        value: "ada@example.test",
        host: "example.org",
        kind: "short",
        now: "2026-01-01T00:00:00.000Z",
        profile: PROFILE,
      },
      EMPTY_STATE,
    );

    expect(outcome.state.mappings[0]?.labelNorm).toBe(
      `qual seu mail ${"x".repeat(300)}`,
    );
  });
});
