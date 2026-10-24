import { describe, expect, it } from "vitest";
import {
  buildProfileContext,
  importProfileJson,
  redactSensitive,
  truncateForContext,
  validateProfile,
} from "./index";

describe("profile validation and JSON import", () => {
  it("accepts a valid profile object and strips invalid values", () => {
    const profile = validateProfile({
      values: {
        fullName: "Ana Silva",
        email: "ana@example.com",
        cpf: "123.456.789-09",
        unknownKey: "ignored",
      },
      updatedAt: "2024-01-01T00:00:00.000Z",
    });

    expect(profile).toEqual({
      values: {
        fullName: "Ana Silva",
        email: "ana@example.com",
        cpf: "123.456.789-09",
      },
      updatedAt: "2024-01-01T00:00:00.000Z",
    });
  });

  it("imports valid JSON profile data and falls back on malformed input", () => {
    expect(
      importProfileJson(
        JSON.stringify({
          values: { fullName: "Bruno Costa", phone: "+55 (11) 99999-9999" },
          updatedAt: "2024-02-02T00:00:00.000Z",
        }),
      ),
    ).toEqual({
      values: {
        fullName: "Bruno Costa",
        phone: "+55 (11) 99999-9999",
      },
      updatedAt: "2024-02-02T00:00:00.000Z",
    });

    expect(importProfileJson("not-json")).toEqual({
      values: {},
      updatedAt: expect.any(String),
    });
  });
});

describe("redaction helpers", () => {
  it("removes sensitive data while preserving ordinary context", () => {
    const redacted = redactSensitive(
      "CPF: 123.456.789-09. RG: 12.345.678-9. Tel: (11) 99999-9999. E-mail: ana@example.com. LinkedIn: https://www.linkedin.com/in/ana-silva. Experiência: trabalho em tecnologia.",
    );

    expect(redacted).not.toContain("123.456.789-09");
    expect(redacted).not.toContain("12.345.678-9");
    expect(redacted).not.toContain("99999-9999");
    expect(redacted).not.toContain("ana@example.com");
    expect(redacted).not.toContain("linkedin.com");
    expect(redacted).toContain("Experiência: trabalho em tecnologia.");
    expect(redacted).toContain("[REDACTED]");
  });

  it("truncates lengthy context text on sentence boundaries", () => {
    const text = "Primeira frase útil. Segunda frase útil. Terceira frase útil. Quarta frase útil.";
    const truncated = truncateForContext(text, 50);

    expect(truncated.length).toBeLessThanOrEqual(50);
    expect(truncated.endsWith(".") || truncated === "").toBe(true);
    expect(truncated).toContain("Primeira frase");
  });

  it("builds a safe profile context from profile values", () => {
    const context = buildProfileContext({
      values: {
        fullName: "Ana Silva",
        email: "ana@example.com",
        phone: "+55 11 99999-9999",
        currentRole: "Engenheira de software",
      },
      updatedAt: "2024-02-02T00:00:00.000Z",
    });

    expect(context).toContain("Ana Silva");
    expect(context).not.toContain("ana@example.com");
    expect(context).not.toContain("99999-9999");
    expect(context).toContain("Engenheira de software");
  });
});
