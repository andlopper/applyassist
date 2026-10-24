import { createFieldVisibilityChecker } from "./visibility";

export type FieldCandidate = {
  element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
  label: string;
  labelSource:
    | "label"
    | "aria-labelledby"
    | "aria-label"
    | "placeholder"
    | "name"
    | "id"
    | "previous-text";
  type: "input" | "textarea" | "select";
};

const FIELD_SELECTOR = "input, textarea, select";
const FIELD_TYPES = new Set([
  "text",
  "email",
  "tel",
  "url",
  "number",
  "date",
  "search",
  "month",
  "week",
  "time",
  "datetime-local",
  "textarea",
]);

function normalizeValue(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

function cleanupLabel(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function getTextFromElement(element: Element): string {
  return cleanupLabel(element.textContent ?? "");
}

function createLabelIndex(ownerDocument: Document): WeakMap<Element, string> {
  const index = new WeakMap<Element, string>();
  for (const label of ownerDocument.querySelectorAll("label")) {
    const text = getTextFromElement(label);
    if (text.length > 0 && label.control) {
      index.set(label.control, text);
    }
  }
  return index;
}

function getAriaLabelledByText(element: Element): string | undefined {
  const identifiers = (element.getAttribute("aria-labelledby") ?? "")
    .split(/\s+/)
    .filter(Boolean);

  if (identifiers.length === 0) {
    return undefined;
  }

  const texts = identifiers
    .map((identifier) => ownerDocumentById(element, identifier))
    .filter((candidate): candidate is Element => candidate !== null)
    .map((candidate) => getTextFromElement(candidate));

  return texts.find((candidate) => candidate.length > 0);
}

function ownerDocumentById(element: Element, identifier: string): Element | null {
  return element.ownerDocument.getElementById(identifier);
}

function getPreviousText(element: Element): string | undefined {
  let current: Element | null = element.previousElementSibling;
  let depth = 0;

  while (current && depth < 6) {
    const text = getTextFromElement(current);
    if (text.length > 0) {
      return text.length > 80 ? text.slice(0, 80) : text;
    }

    current = current.previousElementSibling;
    depth += 1;
  }

  return undefined;
}

function getFieldLabel(
  element: Element,
  labels: WeakMap<Element, string>,
): { label: string; source: FieldCandidate["labelSource"] } | undefined {
  const checks: Array<{ value: string | null | undefined; source: FieldCandidate["labelSource"] }> = [
    { value: labels.get(element), source: "label" },
    { value: getAriaLabelledByText(element), source: "aria-labelledby" },
    { value: element.getAttribute("aria-label"), source: "aria-label" },
    { value: element.getAttribute("placeholder"), source: "placeholder" },
    { value: element.getAttribute("name"), source: "name" },
    { value: element.getAttribute("id"), source: "id" },
    { value: getPreviousText(element), source: "previous-text" },
  ];

  for (const check of checks) {
    const value = normalizeValue(check.value);
    if (value.length > 0) {
      return { label: value, source: check.source };
    }
  }

  return undefined;
}

function isFieldCandidate(element: Element): element is HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement {
  if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement)) {
    return false;
  }

  if (element instanceof HTMLInputElement) {
    const type = (element.type ?? "text").toLowerCase();
    return type !== "hidden" && type !== "file" && type !== "password" && FIELD_TYPES.has(type);
  }

  return true;
}

export function scanFields(root: ParentNode): FieldCandidate[] {
  const fields: FieldCandidate[] = [];
  const elements = root.querySelectorAll ? root.querySelectorAll(FIELD_SELECTOR) : [];
  const firstElement = elements[0];
  const labels = createLabelIndex(
    firstElement instanceof Element ? firstElement.ownerDocument : document,
  );
  const isVisible = createFieldVisibilityChecker();

  for (const element of elements) {
    if (!isFieldCandidate(element) || !isVisible(element)) {
      continue;
    }

    const labelInfo = getFieldLabel(element, labels);
    if (!labelInfo) {
      continue;
    }

    fields.push({
      element,
      label: labelInfo.label,
      labelSource: labelInfo.source,
      type: element instanceof HTMLInputElement ? "input" : element instanceof HTMLTextAreaElement ? "textarea" : "select",
    });
  }

  return fields;
}

export function getFieldLabelCandidates(
  element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
): string[] {
  const labelInfo = getFieldLabel(element, createLabelIndex(element.ownerDocument));
  return labelInfo ? [labelInfo.label] : [];
}

export const collectLabelCandidates = getFieldLabelCandidates;
