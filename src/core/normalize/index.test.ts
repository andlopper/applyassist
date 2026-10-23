import { describe, expect, it } from "vitest";
import { normalizeLabel } from "./index";

describe("normalizeLabel", () => {
  it.each([
    ["Nome Completo*", "nome completo"],
    ["Salário Pretendido (obrigatório)", "salario pretendido"],
    ["Desired Salary*", "desired salary"],
    ["¿Cuál es su salario deseado?", "cual salario deseado"],
    ["The name of the company (optional)", "name company"],
    ["Nome da empresa (obrigatório)", "nome empresa"],
    ["   ", ""],
    ["* required *", ""],
    ["  Campo   com\t \n  muitos   espaços  ", "campo com muitos espacos"],
  ])("normalizes %s to %s", (input, expected) => {
    expect(normalizeLabel(input)).toBe(expected);
  });

  it("handles very long labels without crashing", () => {
    const input = `${"A".repeat(500)} *`;

    expect(normalizeLabel(input)).toBe("a".repeat(500));
  });
});
