import { describe, expect, it } from "vitest";
import {
  buildProfileContext,
  importProfileJson,
  parseProfileText,
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

  it("parses plain-text profile data from onboarding paste", () => {
    const profile = parseProfileText(
      "Nome: Ana Silva\nE-mail: ana@exemplo.com\nTelefone: +55 11 99999-9999\nLinkedIn: https://linkedin.com/in/ana-silva",
    );

    expect(profile.values).toMatchObject({
      fullName: "Ana Silva",
      email: "ana@exemplo.com",
      phone: "+55 11 99999-9999",
      linkedinUrl: "https://linkedin.com/in/ana-silva",
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

  it("handles zero-length truncation and no-sentence boundaries", () => {
    expect(truncateForContext("Texto válido", 0)).toBe("Texto válido");
    expect(truncateForContext("Alpha beta gamma", 10)).toBe("Alpha beta");

    const empty = buildProfileContext({
      values: {
        currentRole: "[REDACTED]",
        unknownKey: "ignored",
      } as never,
      updatedAt: "2024-02-02T00:00:00.000Z",
    });

    expect(empty).toBe("");
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

  it("redacts GitHub, long-digit and identifier values in profile text", () => {
    const redacted = redactSensitive(
      "GitHub: https://github.com/ana-silva/repo; CPF: 123.456.789-09; RG: 12.345.678-9; Telefone: (11) 99999-9999; Código: 1234567890123",
    );

    expect(redacted).not.toContain("https://github.com/ana-silva/repo");
    expect(redacted).not.toContain("123.456.789-09");
    expect(redacted).not.toContain("99999-9999");
    expect(redacted).not.toContain("1234567890123");
    expect(redacted).toContain("[REDACTED]");
  });
});
