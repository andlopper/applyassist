import { describe, expect, it, vi } from "vitest";
import { fillField, undoFieldFill } from "./filler";

describe("content filler", () => {
  it("fills native input values and dispatches input and change events", () => {
    const input = document.createElement("input");
    const onInput = vi.fn();
    const onChange = vi.fn();

    input.addEventListener("input", onInput);
    input.addEventListener("change", onChange);

    const result = fillField(input, "Maria Souza");

    expect(result).toMatchObject({ applied: true, previous: "", value: "Maria Souza", reason: "filled" });
    expect(input.value).toBe("Maria Souza");
    expect(onInput).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("does not overwrite non-empty fields without explicit overwrite", () => {
    const input = document.createElement("input");
    input.value = "valor atual";

    const result = fillField(input, "novo valor");

    expect(result).toMatchObject({ applied: false, previous: "valor atual", reason: "skipped" });
    expect(input.value).toBe("valor atual");
  });

  it("respects maxlength and can undo a previous fill", () => {
    const input = document.createElement("input");
    input.maxLength = 5;

    const blocked = fillField(input, "abcdef");
    expect(blocked).toMatchObject({ applied: false, reason: "maxlength" });

    input.value = "abc";
    const filled = fillField(input, "defgh", { allowOverwrite: true });
    expect(filled).toMatchObject({ applied: true, value: "defgh" });
    expect(undoFieldFill(input)).toBe(true);
    expect(input.value).toBe("abc");
  });

  it("fills a select via option value or normalized option text when overwrite is allowed", () => {
    const select = document.createElement("select");
    select.innerHTML = `
      <option value="sp">São Paulo</option>
      <option value="rj">Rio de Janeiro</option>
    `;

    const byValue = fillField(select, "rj", { allowOverwrite: true });
    expect(byValue).toMatchObject({ applied: true, value: "rj" });
    expect(select.value).toBe("rj");

    const byText = fillField(select, "são paulo", { allowOverwrite: true });
    expect(byText).toMatchObject({ applied: true, value: "sp" });
    expect(select.value).toBe("sp");
  });

  it("works with controlled inputs that define custom value setters", () => {
    const input = document.createElement("input");
    let controlledValue = "inicial";

    Object.defineProperty(input, "value", {
      get: () => controlledValue,
      set: (nextValue: string) => {
        controlledValue = nextValue;
      },
      configurable: true,
    });

    const result = fillField(input, "atualizado", { allowOverwrite: true });

    expect(result).toMatchObject({ applied: true, value: "atualizado" });
    expect(controlledValue).toBe("atualizado");
  });
});
