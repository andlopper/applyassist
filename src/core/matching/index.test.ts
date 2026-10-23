import { describe, expect, it } from "vitest";
import { matchApproximateLabel, matchExactLabel } from "./index";

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
});
