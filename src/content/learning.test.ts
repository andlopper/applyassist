import { afterEach, describe, expect, it, vi } from "vitest";
import { mountLearningCapture } from "./learning";

function addField(
  form: HTMLFormElement,
  labelText: string,
  value: string,
  type = "text",
): HTMLInputElement {
  const label = document.createElement("label");
  const input = document.createElement("input");
  const id = `learning-${document.querySelectorAll("input").length}`;
  label.htmlFor = id;
  label.textContent = labelText;
  input.id = id;
  input.type = type;
  input.value = value;
  input.style.width = "160px";
  input.style.height = "24px";
  form.append(label, input);
  return input;
}

function addSelect(form: HTMLFormElement, labelText: string, value: string): HTMLSelectElement {
  const label = document.createElement("label");
  const select = document.createElement("select");
  const option = document.createElement("option");
  const id = `learning-select-${document.querySelectorAll("select").length}`;
  label.htmlFor = id;
  label.textContent = labelText;
  select.id = id;
  select.style.width = "160px";
  select.style.height = "24px";
  option.value = value;
  option.textContent = value;
  select.append(option);
  form.append(label, select);
  return select;
}

describe("active-session learning capture", () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it("captures field blur values only while mounted", () => {
    const form = document.createElement("form");
    document.body.append(form);
    const email = addField(form, "E-mail", "ada@example.test", "email");
    const sendMessage = vi.fn(async () => undefined);
    const stop = mountLearningCapture(document, sendMessage);

    email.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));

    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "LEARN_EVENT",
        labelNorm: "mail",
        value: "ada@example.test",
        fieldKey: "email",
        host: window.location.hostname,
      }),
    );
    stop();
    email.value = "changed@example.test";
    email.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it("captures eligible fields during submit without preventing the page submission", () => {
    const form = document.createElement("form");
    document.body.append(form);
    addField(form, "E-mail", "ada@example.test", "email");
    addField(form, "Código OTP", "123456");
    const sendMessage = vi.fn(async () => undefined);
    const stop = mountLearningCapture(document, sendMessage);
    const submit = new Event("submit", { bubbles: true, cancelable: true });

    expect(form.dispatchEvent(submit)).toBe(true);
    expect(submit.defaultPrevented).toBe(false);
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "LEARN_EVENT",
        fieldKey: "email",
        value: "ada@example.test",
      }),
    );
    stop();
  });

  it("does not read or learn hidden fields on submit", () => {
    const form = document.createElement("form");
    document.body.append(form);
    const hidden = addField(form, "E-mail", "hidden@example.test", "hidden");
    hidden.type = "text";
    hidden.hidden = true;
    const sendMessage = vi.fn(async () => undefined);
    const stop = mountLearningCapture(document, sendMessage);

    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

    expect(sendMessage).not.toHaveBeenCalled();
    stop();
  });

  it("skips forbidden, sensitive, empty, and unnormalizable fields", () => {
    const form = document.createElement("form");
    document.body.append(form);
    const otp = addField(form, "Código OTP", "123456");
    const cpf = addField(form, "CPF", "12345678900");
    const empty = addField(form, "E-mail", "   ", "email");
    const punctuation = addField(form, "---", "answer");
    const sendMessage = vi.fn(async () => undefined);
    const stop = mountLearningCapture(document, sendMessage);

    for (const field of [otp, cpf, empty, punctuation]) {
      field.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    }

    expect(sendMessage).not.toHaveBeenCalled();
    stop();
  });

  it("captures select values while ignoring unrelated focusout and submit events", () => {
    const form = document.createElement("form");
    document.body.append(form);
    const select = addSelect(form, "Work preference", "Hybrid");
    const sendMessage = vi.fn(async () => undefined);
    const stop = mountLearningCapture(document, sendMessage);

    document.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    document.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    select.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ value: "Hybrid", kind: "short" }),
    );
    stop();
  });

  it("does not retain event listeners after repeated cleanup", () => {
    const form = document.createElement("form");
    document.body.append(form);
    const email = addField(form, "E-mail", "ada@example.test", "email");
    const sendMessage = vi.fn(async () => undefined);
    const stop = mountLearningCapture(document, sendMessage);

    stop();
    stop();
    email.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("warns without logging field data when saving a learning event fails", async () => {
    const form = document.createElement("form");
    document.body.append(form);
    const email = addField(form, "E-mail", "ada@example.test", "email");
    const sendMessage = vi.fn(async () => {
      throw new Error("storage detail");
    });
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const stop = mountLearningCapture(document, sendMessage);

    email.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    await vi.waitFor(() => {
      expect(warning).toHaveBeenCalledWith("Unable to record a learning event.");
    });
    expect(warning.mock.calls.flat().join(" ")).not.toContain("ada@example.test");
    expect(warning.mock.calls.flat().join(" ")).not.toContain("storage detail");

    stop();
    warning.mockRestore();
  });
});
