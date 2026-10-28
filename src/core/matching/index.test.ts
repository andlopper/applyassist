import { describe, expect, it } from "vitest";
import {
  classifyFieldLabel,
  matchApproximateLabel,
  matchExactLabel,
} from "./index";

describe("R-04 label matching", () => {
  it.each([
    ["nome completo", "fullName"],
    ["primeiro nome", "firstName"],
    ["sobrenome", "lastName"],
    ["e-mail", "email"],
    ["telefone", "phone"],
    ["cidade", "city"],
    ["estado", "state"],
    ["país", "country"],
    ["perfil linkedin", "linkedinUrl"],
    ["perfil github", "githubUrl"],
    ["portfólio", "portfolioUrl"],
    ["pretensão salarial", "salaryExpectation"],
    ["disponibilidade", "availability"],
    ["aviso prévio", "noticePeriod"],
    ["modelo de trabalho", "workModel"],
    ["nível de inglês", "englishLevel"],
    ["empresa atual", "currentCompany"],
    ["cargo atual", "currentRole"],
    ["anos de experiência", "yearsExperience"],
    ["cpf", "cpf"],
    ["rg", "rg"],
    ["data de nascimento", "birthDate"],
    ["endereço", "address"],
    ["cep", "postalCode"],
    ["gênero", "gender"],
    ["raça", "race"],
    ["pessoa com deficiência", "pcd"],
  ])("maps Portuguese label %s to %s", (label, fieldKey) => {
    expect(matchExactLabel(label)).toEqual({ kind: "matched", fieldKey });
  });

  describe("R-04 approximate label matching", () => {
    it.each([
      ["salário preterido", "salaryExpectation"],
      ["e-mail adress", "email"],
      ["periodo de preaviso", "noticePeriod"],
    ])("returns a scored match for Portuguese label %s", (label, fieldKey) => {
      const result = matchApproximateLabel(label);

      expect(result.kind).not.toBe("unknown");
      expect(result).toMatchObject({ fieldKey });
      expect(result.score).toBeGreaterThanOrEqual(0.7);
    });

    it("normalizes punctuation and duplicated spaces before approximate matching", () => {
      expect(matchApproximateLabel("  e-mail   adress!! ")).toMatchObject({
        kind: "uncertain",
        fieldKey: "email",
        score: expect.any(Number),
      });
    });

    it.each([
      ["desired salary", "salaryExpectation"],
      ["email adress", "email"],
    ])("returns a scored match for English label %s", (label, fieldKey) => {
      const result = matchApproximateLabel(label);

      expect(result.kind).not.toBe("unknown");
      expect(result).toMatchObject({ fieldKey });
    });

    it.each([
      ["salario deseado", "salaryExpectation"],
      ["correo electronico", "email"],
    ])("returns a scored match for Spanish label %s", (label, fieldKey) => {
      const result = matchApproximateLabel(label);

      expect(result.kind).not.toBe("unknown");
      expect(result).toMatchObject({ fieldKey });
    });

    it("classifies scores using the ready and uncertain thresholds", () => {
      expect(matchApproximateLabel("salario pretendido!!")).toMatchObject({
        kind: "matched",
        fieldKey: "salaryExpectation",
        score: 1,
      });
      expect(matchApproximateLabel("phome")).toMatchObject({
        kind: "uncertain",
        fieldKey: "phone",
      });
      expect(matchApproximateLabel("phoen").kind).toBe("unknown");
    });

    it.each([
      "project budget",
      "favorite color",
      "pet name",
      "office floor",
      "lunch preference",
      "parking permit",
      "shoe size",
      "favorite movie",
      "weekend plans",
      "shirt size",
      "travel destination",
      "desk number",
      "coffee preference",
      "music genre",
      "book title",
      "weather today",
      "preferred snack",
      "hobby description",
      "team mascot",
      "vacation photos",
    ])("does not match unrelated label %s", (label) => {
      expect(matchApproximateLabel(label).kind).toBe("unknown");
    });

    it.each(["", "   ", "x".repeat(500)])(
      "returns unknown for empty or very long input %j",
      (label) => {
        expect(matchApproximateLabel(label).kind).toBe("unknown");
      },
    );
  });

  it.each([
    ["full name", "fullName"],
    ["first name", "firstName"],
    ["last name", "lastName"],
    ["email address", "email"],
    ["phone number", "phone"],
    ["city", "city"],
    ["state province", "state"],
    ["country", "country"],
    ["linkedin url", "linkedinUrl"],
    ["github profile", "githubUrl"],
    ["portfolio website", "portfolioUrl"],
    ["desired salary", "salaryExpectation"],
    ["availability", "availability"],
    ["notice period", "noticePeriod"],
    ["work model", "workModel"],
    ["english level", "englishLevel"],
    ["current company", "currentCompany"],
    ["current role", "currentRole"],
    ["years of experience", "yearsExperience"],
    ["cpf number", "cpf"],
    ["rg number", "rg"],
    ["date of birth", "birthDate"],
    ["street address", "address"],
    ["postal code", "postalCode"],
    ["gender", "gender"],
    ["race", "race"],
    ["disability status", "pcd"],
  ])("maps English label %s to %s", (label, fieldKey) => {
    expect(matchExactLabel(label)).toEqual({ kind: "matched", fieldKey });
  });

  it.each([
    ["nombre completo", "fullName"],
    ["nombre", "firstName"],
    ["apellido", "lastName"],
    ["correo electronico", "email"],
    ["telefono", "phone"],
    ["ciudad", "city"],
    ["estado provincia", "state"],
    ["pais", "country"],
    ["perfil linkedin", "linkedinUrl"],
    ["perfil github", "githubUrl"],
    ["portafolio", "portfolioUrl"],
    ["salario deseado", "salaryExpectation"],
    ["disponibilidad", "availability"],
    ["periodo de preaviso", "noticePeriod"],
    ["modalidad de trabajo", "workModel"],
    ["nivel de ingles", "englishLevel"],
    ["empresa actual", "currentCompany"],
    ["cargo actual", "currentRole"],
    ["anos de experiencia", "yearsExperience"],
    ["cpf", "cpf"],
    ["rg", "rg"],
    ["fecha de nacimiento", "birthDate"],
    ["direccion", "address"],
    ["codigo postal", "postalCode"],
    ["genero", "gender"],
    ["raza", "race"],
    ["discapacidad", "pcd"],
  ])("maps Spanish label %s to %s", (label, fieldKey) => {
    expect(matchExactLabel(label)).toEqual({ kind: "matched", fieldKey });
  });

  it.each([
    ["pretensão salarial", "salaryExpectation"],
    ["pretensão", "salaryExpectation"],
    ["desired salary", "salaryExpectation"],
    ["salário pretendido", "salaryExpectation"],
  ])("matches salary synonym %s exactly", (label, fieldKey) => {
    expect(matchExactLabel(label)).toEqual({ kind: "matched", fieldKey });
  });

  it.each([
    ["", { kind: "unknown" }],
    ["   ", { kind: "unknown" }],
    ["campo sem correspondência", { kind: "unknown" }],
    ["password", { kind: "unknown" }],
    ["consent to terms", { kind: "unknown" }],
  ])("returns unknown for %j", (label, expected) => {
    expect(matchExactLabel(label)).toEqual(expected);
  });

  it("normalizes accents, punctuation, and duplicated spaces before matching", () => {
    expect(matchExactLabel("  PRETENSÃO   SALARIAL!! ")).toEqual({
      kind: "matched",
      fieldKey: "salaryExpectation",
    });
  });

  it("returns unknown for a very long unmatched label", () => {
    expect(matchExactLabel("x".repeat(500))).toEqual({ kind: "unknown" });
  });

  it("classifies labels through the task-11 pipeline in the required order", () => {
    expect(
      classifyFieldLabel({
        label: "Pretensão salarial",
        type: "text",
      }),
    ).toMatchObject({
      kind: "ready",
      fieldKey: "salaryExpectation",
      confidence: expect.any(Number),
    });

    expect(
      classifyFieldLabel({
        label: "salario preterido",
        type: "text",
      }),
    ).toMatchObject({
      kind: "ready",
      fieldKey: "salaryExpectation",
      confidence: expect.any(Number),
    });

    expect(
      classifyFieldLabel({
        label: "porque você quer esta vaga",
        type: "textarea",
      }),
    ).toMatchObject({
      kind: "open_text",
      reason: expect.any(String),
    });
  });

  it("keeps learned, unreviewed mappings as uncertain", () => {
    expect(
      classifyFieldLabel({
        label: "pretensão salarial",
        learnedMappings: {
          "pretensao salarial": { fieldKey: "salaryExpectation", reviewed: false },
        },
      }),
    ).toMatchObject({
      kind: "uncertain",
      fieldKey: "salaryExpectation",
    });
  });

  it("recognizes common labels across PT/EN/ES with the pipeline", () => {
    const fixtures = [
      "pretensão salarial",
      "email",
      "nome completo",
      "telefone",
      "cidade",
      "estado",
      "pais",
      "linkedin url",
      "desired salary",
      "full name",
      "first name",
      "last name",
      "company",
      "current role",
      "portfólio",
      "fecha de nacimiento",
      "salario deseado",
      "codigo postal",
      "disponibilidad",
      "por que me contratar",
    ] as const;

    const recognized = fixtures.filter((label) => {
      const result = classifyFieldLabel({ label, type: "text" });
      return result.kind !== "unknown";
    }).length;

    expect(recognized / fixtures.length).toBeGreaterThanOrEqual(0.9);
  });

  it("covers forbidden, blocked, learned, and open-text branches", () => {
    expect(classifyFieldLabel({ label: "senha", type: "text" })).toMatchObject({
      kind: "forbidden",
    });
    expect(
      classifyFieldLabel({ label: "cpf", type: "text", settings: { documents: false } }),
    ).toMatchObject({
      kind: "blocked_by_setting",
      fieldKey: "cpf",
    });
    expect(
      classifyFieldLabel({
        label: "email",
        autocomplete: "email",
      }),
    ).toMatchObject({
      kind: "ready",
      fieldKey: "email",
    });
    expect(
      classifyFieldLabel({
        label: "pretensão salarial",
        learnedMappings: {
          "pretensao salarial": { fieldKey: "salaryExpectation", reviewed: false },
        },
      }),
    ).toMatchObject({
      kind: "uncertain",
      fieldKey: "salaryExpectation",
    });
    expect(
      classifyFieldLabel({
        label: "porque você quer trabalhar aqui",
        maxlength: 250,
      }),
    ).toMatchObject({
      kind: "open_text",
    });
    expect(classifyFieldLabel({ label: "phoen" }).kind).toBe("unknown");
  });

  it("covers secret-field blocked paths and learned host precedence", () => {
    expect(
      classifyFieldLabel({
        label: "cpf",
        settings: { documents: false },
        metadata: { label: "cpf", autocomplete: "off" },
      }),
    ).toMatchObject({
      kind: "blocked_by_setting",
      fieldKey: "cpf",
    });

    expect(
      classifyFieldLabel({
        label: "email",
        host: "example.com",
        learnedMappings: {
          "email": { fieldKey: "email", reviewed: true, host: "example.com" },
        },
      }),
    ).toMatchObject({
      kind: "ready",
      fieldKey: "email",
    });

    expect(
      classifyFieldLabel({
        label: "email",
        host: "example.com",
        learnedMappings: {
          email: { fieldKey: "email", reviewed: false, host: "other.com" },
        },
      }),
    ).toMatchObject({
      kind: "uncertain",
      fieldKey: "email",
    });

    expect(
      classifyFieldLabel({
        label: "endereço",
        settings: { address: false },
      }),
    ).toMatchObject({ kind: "blocked_by_setting", fieldKey: "address" });
  });

  it("covers nearest unknown and forbidden autocomplete branches", () => {
    expect(
      classifyFieldLabel({
        label: "campo sem relação",
        metadata: { label: "cartao de credito", autocomplete: "cc-name" },
      }),
    ).toMatchObject({ kind: "forbidden" });

    expect(
      classifyFieldLabel({
        label: "email adress",
        metadata: { label: "email adress" },
      }),
    ).toMatchObject({
      kind: "ready",
      fieldKey: "email",
    });

    expect(
      classifyFieldLabel({ label: "descreva sua experiência", type: "textarea" }).kind,
    ).toBe("open_text");
    expect(classifyFieldLabel({ label: "x".repeat(250), type: "text" }).kind).toBe(
      "unknown",
    );
  });
});
