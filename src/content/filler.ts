export type FillFieldOptions = {
  allowOverwrite?: boolean;
  force?: boolean;
  skipIfFilled?: boolean;
};

export type FillResult = {
  element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
  previous: string;
  value: string;
  applied: boolean;
  reason: "filled" | "skipped" | "maxlength" | "unsupported";
};

const previousValueByElement = new WeakMap<
  HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  string
>();

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function getCurrentValue(element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement): string {
  if (element instanceof HTMLSelectElement) {
    return element.value ?? "";
  }

  return element.value ?? "";
}

function setNativeValue(
  element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  value: string,
): void {
  const ownDescriptor = Object.getOwnPropertyDescriptor(element, "value");
  const descriptor = ownDescriptor ??
    Object.getOwnPropertyDescriptor(
      element instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : element instanceof HTMLInputElement
          ? HTMLInputElement.prototype
          : HTMLTextAreaElement.prototype,
      "value",
    );

  if (descriptor && typeof descriptor.set === "function") {
    descriptor.set.call(element, value);
    return;
  }

  const property = "value" as const;
  element[property] = value;
}

function dispatchValueEvents(
  element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
): void {
  if (element instanceof HTMLSelectElement) {
    element.dispatchEvent(new Event("change", { bubbles: true }));
    return;
  }

  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

function isFillableElement(
  element: Element,
): element is HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement {
  return (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement
  );
}

function resolveSelectValue(
  element: HTMLSelectElement,
  rawValue: string,
): string | undefined {
  const normalizedValue = normalizeText(rawValue);
  const optionMatch = Array.from(element.options).find((option) =>
    normalizeText(option.value ?? "") === normalizedValue ||
    normalizeText(option.textContent ?? "") === normalizedValue,
  );

  if (optionMatch) {
    return optionMatch.value;
  }

  return element.value;
}

export function fillField(
  element: Element,
  rawValue: string,
  options: FillFieldOptions = {},
): FillResult | null {
  if (!isFillableElement(element)) {
    return {
      element: element as never,
      previous: "",
      value: rawValue,
      applied: false,
      reason: "unsupported",
    };
  }

  const allowOverwrite = options.allowOverwrite ?? options.force ?? false;
  const previous = getCurrentValue(element);

  if (previous.length > 0 && !(allowOverwrite || options.force) && options.skipIfFilled !== false) {
    return {
      element,
      previous,
      value: rawValue,
      applied: false,
      reason: "skipped",
    };
  }

  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    const maxLength = Number(element.maxLength);
    if (Number.isFinite(maxLength) && maxLength >= 0 && rawValue.length > maxLength) {
      return {
        element,
        previous,
        value: rawValue,
        applied: false,
        reason: "maxlength",
      };
    }
  }

  const nextValue =
    element instanceof HTMLSelectElement ? resolveSelectValue(element, rawValue) ?? rawValue : rawValue;

  previousValueByElement.set(element, previous);
  setNativeValue(element, nextValue);
  dispatchValueEvents(element);

  return {
    element,
    previous,
    value: nextValue,
    applied: true,
    reason: "filled",
  };
}

export function fillFields(
  fields: ReadonlyArray<{ element: Element; value: string }>,
  options: FillFieldOptions = {},
): FillResult[] {
  return fields.map(({ element, value }) => fillField(element, value, options)).filter((entry): entry is FillResult => entry !== null);
}

export function undoFieldFill(
  element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
): boolean {
  const previous = previousValueByElement.get(element);
  if (previous === undefined) {
    return false;
  }

  setNativeValue(element, previous);
  dispatchValueEvents(element);
  previousValueByElement.delete(element);
  return true;
}

export function createFillHistory(): {
  record: (result: FillResult | null) => FillResult | null;
  undoLast: () => boolean;
  clear: () => void;
} {
  const entries: FillResult[] = [];

  return {
    record(result) {
      if (result && result.applied) {
        entries.push(result);
      }
      return result;
    },
    undoLast() {
      const lastEntry = entries.pop();
      if (!lastEntry) {
        return false;
      }

      return undoFieldFill(lastEntry.element);
    },
    clear() {
      entries.length = 0;
    },
  };
}

export const applyFill = fillField;
export const setFieldValue = fillField;
