import { describe, expect, it } from "vitest";
import { matchExactLabel } from "./index";

describe("R-04 exact label matching", () => {
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
