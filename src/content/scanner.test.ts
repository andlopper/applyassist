import { describe, expect, it, vi } from "vitest";
import { scanFields } from "./scanner";
import { isFieldVisible } from "./visibility";

describe("scanFields", () => {
  it("collects the first visible label text and ignores hidden candidates", () => {
    document.body.innerHTML = `
      <div>
        <label for="salary">Pretensão salarial</label>
        <input id="salary" type="text" style="width:160px; height:24px;" />
      </div>
      <div style="position:absolute; left:-9999px; width:200px; height:30px;">
        <label for="hidden-field">Salário oculto</label>
        <input id="hidden-field" type="text" style="width:160px; height:24px;" />
      </div>
      <input aria-label="Email" type="email" style="opacity: 0; width: 160px; height: 24px;" />
    `;

    const fields = scanFields(document);

    expect(fields.map((field) => field.label)).toEqual(["Pretensão salarial"]);
    expect(fields.some((field) => field.label === "Salário oculto")).toBe(false);
    expect(fields.some((field) => field.label === "Email")).toBe(false);
  });

  it("ignores fields covered by another element in the center point", () => {
    document.body.innerHTML = `
      <div id="covered-holder" style="position:relative; width:200px; height:40px;">
        <label for="covered">Cidade</label>
        <input id="covered" type="text" style="width:100px; height:20px;" />
      </div>
      <div id="covering" style="position:absolute; left:0; top:0; width:200px; height:40px; background: #fff; z-index: 2;"></div>
    `;

    const coveredInput = document.getElementById("covered");
    const covering = document.getElementById("covering");
    expect(coveredInput).not.toBeNull();
    expect(covering).not.toBeNull();

    vi.spyOn(document, "elementFromPoint").mockImplementation((x: number, y: number) => {
      if (coveredInput && covering && x >= 0 && y >= 0) {
        return covering;
      }

      return null;
    });

    expect(isFieldVisible(coveredInput!)).toBe(false);
    expect(scanFields(document).some((field) => field.label === "Cidade")).toBe(false);
    vi.restoreAllMocks();
  });

  it("performs a fast scan for many visible fields", () => {
    const fieldsHtml: string[] = [];

    for (let index = 0; index < 100; index += 1) {
      fieldsHtml.push(`<div style="display:block;"><label for="field-${index}">Campo ${index}</label><input id="field-${index}" type="text" style="width:120px; height:20px;" /></div>`);
    }

    document.body.innerHTML = fieldsHtml.join("");

    scanFields(document);
    const startedAt = performance.now();
    const fields = scanFields(document);
    const elapsedMs = performance.now() - startedAt;

    expect(fields.length).toBeGreaterThan(80);
    expect(elapsedMs).toBeLessThan(100);
  });
});
