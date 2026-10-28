import { classifyFieldLabel, type FieldClassificationResult } from "../../core/matching";
import { FIELD_KEYS, type FieldKey } from "../../core/matching/field-key";
import { createFillHistory, fillField, type FillResult } from "../filler";
import { scanFields, type FieldCandidate } from "../scanner";
import { ptBr } from "../../shared/i18n/pt-br";

type OverlayStatus = "ready" | "uncertain" | "open" | "blocked";

type OverlayField =
  | {
      candidate: FieldCandidate;
      fieldKey: FieldKey;
      status: "ready" | "uncertain";
      suggestion: string;
    }
  | {
      candidate: FieldCandidate;
      status: "open" | "blocked";
    };

type FillValuesRequest = {
  type: "GET_FILL_VALUES";
  fieldKeys: string[];
  host: string;
};

export type OverlayMessageSender = (message: FillValuesRequest) => Promise<unknown>;

export interface OverlayController {
  refresh(): Promise<void>;
  dispose(): void;
}

const HOST_ID = "applyassist-overlay";
const REFRESH_DELAY_MS = 150;
const MAX_LABEL_LENGTH = 160;
const MAX_SUGGESTION_LENGTH = 120;

const OVERLAY_STYLES = `
  :host {
    all: initial;
    color: #17212b;
    font: 14px/1.45 system-ui, sans-serif;
    position: fixed;
    right: 16px;
    top: 16px;
    z-index: 2147483647;
  }
  * { box-sizing: border-box; }
  .panel {
    background: #fff;
    border: 1px solid #687786;
    border-radius: 10px;
    box-shadow: 0 4px 18px #17212b40;
    max-height: min(80vh, 680px);
    overflow: auto;
    padding: 14px;
    width: min(380px, calc(100vw - 32px));
  }
  .heading, .actions, .counts, .field-heading {
    align-items: center;
    display: flex;
    gap: 8px;
    justify-content: space-between;
  }
  h2 { font-size: 16px; margin: 0; }
  button {
    background: #f3f6f8;
    border: 1px solid #586979;
    border-radius: 6px;
    color: #17212b;
    cursor: pointer;
    font: inherit;
    min-height: 36px;
    padding: 6px 10px;
  }
  button:focus-visible { outline: 3px solid #075db5; outline-offset: 2px; }
  button:disabled { cursor: not-allowed; opacity: .6; }
  .close { min-width: 36px; }
  .counts { align-items: flex-start; flex-wrap: wrap; justify-content: flex-start; margin: 12px 0; }
  .count, .status-chip { border-radius: 999px; padding: 3px 8px; }
  .count { background: #edf2f6; }
  .status-chip { background: #e8f4ec; color: #174b2b; }
  .status-uncertain { background: #fff4d6; color: #604600; }
  .status-open { background: #edf2f6; color: #34495c; }
  .status-blocked { background: #fce9e9; color: #722222; }
  .fields { list-style: none; margin: 0; padding: 0; }
  .field { border-top: 1px solid #d5dde4; padding: 10px 0; }
  .field-label { font-weight: 600; overflow-wrap: anywhere; }
  .suggestion { color: #34495c; margin: 4px 0 8px; overflow-wrap: anywhere; }
  .actions { justify-content: flex-start; margin-top: 12px; }
  .live { min-height: 1.45em; }
  .field-chip { margin-top: 8px; }
`;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseFillValues(response: unknown): Partial<Record<FieldKey, string>> {
  if (!isRecord(response) || response.error === true || !isRecord(response.values)) {
    throw new Error("Invalid GET_FILL_VALUES response.");
  }

  const values: Partial<Record<FieldKey, string>> = {};
  for (const [rawKey, value] of Object.entries(response.values)) {
    const fieldKey = FIELD_KEYS.find((knownKey) => knownKey === rawKey);
    if (fieldKey && typeof value === "string" && value.trim().length > 0) {
      values[fieldKey] = value;
    }
  }

  return values;
}

function getFieldClassification(candidate: FieldCandidate): FieldClassificationResult {
  const element = candidate.element;
  const type = element.type;
  const autocomplete = element.autocomplete;
  const maxlength =
    element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement
      ? element.maxLength
      : undefined;

  return classifyFieldLabel({
    label: candidate.label,
    type,
    autocomplete,
    maxlength,
    metadata: {
      type,
      autocomplete,
      name: element.name,
      id: element.id,
      label: candidate.label,
    },
  });
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}…` : value;
}

function statusLabel(status: OverlayStatus): string {
  switch (status) {
    case "ready":
      return ptBr.overlayReady;
    case "uncertain":
      return ptBr.overlayUncertain;
    case "open":
      return ptBr.overlayOpen;
    case "blocked":
      return ptBr.overlayBlocked;
  }
}

function countStatus(fields: readonly OverlayField[], status: OverlayStatus): number {
  return fields.filter((field) => field.status === status).length;
}

function createButton(
  ownerDocument: Document,
  label: string,
  action: string,
  onClick: () => void,
): HTMLButtonElement {
  const button = ownerDocument.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.dataset.action = action;
  button.addEventListener("click", onClick);
  return button;
}

export function mountOverlay(
  ownerDocument: Document,
  sendMessage: OverlayMessageSender,
  onClose?: () => void,
): OverlayController {
  const host = ownerDocument.createElement("div");
  host.id = HOST_ID;
  const shadowRoot = host.attachShadow({ mode: "open" });
  const style = ownerDocument.createElement("style");
  style.textContent = OVERLAY_STYLES;
  shadowRoot.append(style);

  const panel = ownerDocument.createElement("section");
  panel.className = "panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "false");
  panel.setAttribute("aria-labelledby", "applyassist-title");

  const heading = ownerDocument.createElement("div");
  heading.className = "heading";
  const title = ownerDocument.createElement("h2");
  title.id = "applyassist-title";
  title.textContent = ptBr.overlayTitle;
  heading.append(title);
  panel.append(heading);

  const closeButton = createButton(ownerDocument, ptBr.overlayClose, "close", () => dispose());
  closeButton.className = "close";
  closeButton.setAttribute("aria-label", ptBr.overlayClose);
  heading.append(closeButton);

  const counts = ownerDocument.createElement("div");
  counts.className = "counts";
  counts.setAttribute("aria-label", ptBr.overlayCounts);
  panel.append(counts);

  const chip = createButton(ownerDocument, "", "chip", () => {
    if (focusedField) {
      applySuggestion(focusedField);
    }
  });
  chip.className = "field-chip";
  chip.hidden = true;
  panel.append(chip);

  const status = ownerDocument.createElement("p");
  status.className = "live";
  status.setAttribute("aria-live", "polite");
  status.setAttribute("role", "status");
  status.textContent = ptBr.overlayLoading;
  panel.append(status);

  const fieldsList = ownerDocument.createElement("ul");
  fieldsList.className = "fields";
  panel.append(fieldsList);

  const actions = ownerDocument.createElement("div");
  actions.className = "actions";
  const applyReadyButton = createButton(
    ownerDocument,
    ptBr.overlayApplyReady,
    "apply-ready",
    applyReadyFields,
  );
  const undoButton = createButton(ownerDocument, ptBr.overlayUndo, "undo", undoLast);
  undoButton.disabled = true;
  actions.append(applyReadyButton, undoButton);
  panel.append(actions);
  shadowRoot.append(panel);
  ownerDocument.body.append(host);

  const fillHistory = createFillHistory();
  let fields: OverlayField[] = [];
  let focusedField: OverlayField | undefined;
  let disposed = false;
  let refreshSequence = 0;
  let refreshTimer: number | undefined;
  let lastLiveMessage = "";

  function announce(message: string): void {
    if (lastLiveMessage === message) {
      status.textContent = "";
    }
    status.textContent = message;
    lastLiveMessage = message;
  }

  function updateCounts(): void {
    const entries = [
      [ptBr.overlayReadyCount, countStatus(fields, "ready")],
      [ptBr.overlayUncertainCount, countStatus(fields, "uncertain")],
      [ptBr.overlayOpenCount, countStatus(fields, "open")],
      [ptBr.overlayBlockedCount, countStatus(fields, "blocked")],
    ] as const;
    counts.replaceChildren(
      ...entries.map(([label, count]) => {
        const item = ownerDocument.createElement("span");
        item.className = "count";
        item.textContent = `${label}: ${count}`;
        return item;
      }),
    );
  }

  function renderFields(): void {
    fieldsList.replaceChildren();
    for (const field of fields) {
      const item = ownerDocument.createElement("li");
      item.className = "field";
      const fieldHeading = ownerDocument.createElement("div");
      fieldHeading.className = "field-heading";
      const label = ownerDocument.createElement("span");
      label.className = "field-label";
      label.textContent = truncate(field.candidate.label, MAX_LABEL_LENGTH);
      const badge = ownerDocument.createElement("span");
      badge.className = `status-chip status-${field.status}`;
      badge.textContent = statusLabel(field.status);
      fieldHeading.append(label, badge);
      item.append(fieldHeading);

      const suggestion = ownerDocument.createElement("p");
      suggestion.className = "suggestion";
      suggestion.textContent =
        field.status === "ready" || field.status === "uncertain"
          ? truncate(field.suggestion, MAX_SUGGESTION_LENGTH)
          : ptBr.overlayNoSuggestion;
      item.append(suggestion);

      if (field.status === "ready" || field.status === "uncertain") {
        item.append(
          createButton(ownerDocument, ptBr.overlayApply, "apply", () => applySuggestion(field)),
        );
      }

      fieldsList.append(item);
    }
    updateCounts();
  }

  function applySuggestion(field: OverlayField): FillResult | undefined {
    if (field.status !== "ready" && field.status !== "uncertain") {
      return undefined;
    }

    const result = fillHistory.record(fillField(field.candidate.element, field.suggestion));
    if (result?.applied) {
      undoButton.disabled = false;
      announce(ptBr.overlayApplied);
    } else {
      announce(ptBr.overlaySkipped);
    }
    return result ?? undefined;
  }

  function applyReadyFields(): void {
    const readyFields = fields.filter(
      (field): field is Extract<OverlayField, { status: "ready" }> => field.status === "ready",
    );
    let appliedCount = 0;
    for (const field of readyFields) {
      if (applySuggestion(field)?.applied) {
        appliedCount += 1;
      }
    }
    if (appliedCount === 0) {
      announce(ptBr.overlaySkipped);
    }
  }

  function undoLast(): void {
    const undone = fillHistory.undoLast();
    undoButton.disabled = !undone;
    announce(undone ? ptBr.overlayUndone : ptBr.overlayNothingToUndo);
  }

  function findField(element: EventTarget | null): OverlayField | undefined {
    return fields.find((field) => field.candidate.element === element);
  }

  function handleFocusIn(event: FocusEvent): void {
    if (event.composedPath().includes(host)) {
      return;
    }

    focusedField = findField(event.target);
    if (focusedField && (focusedField.status === "ready" || focusedField.status === "uncertain")) {
      chip.hidden = false;
      chip.textContent = `${ptBr.overlayUsePrefix} ${truncate(
        focusedField.suggestion,
        MAX_SUGGESTION_LENGTH,
      )} ${ptBr.overlayUseShortcut}`;
      return;
    }
    chip.hidden = true;
  }

  function handleKeyDown(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      dispose();
      return;
    }

    if (event.altKey && event.key.toLowerCase() === "a" && focusedField) {
      event.preventDefault();
      applySuggestion(focusedField);
    }
  }

  function scheduleRefresh(): void {
    if (refreshTimer !== undefined) {
      ownerDocument.defaultView?.clearTimeout(refreshTimer);
    }
    refreshTimer = ownerDocument.defaultView?.setTimeout(() => {
      refreshTimer = undefined;
      void refresh();
    }, REFRESH_DELAY_MS);
  }

  async function refresh(): Promise<void> {
    if (disposed) {
      return;
    }

    const sequence = ++refreshSequence;
    announce(ptBr.overlayLoading);
    try {
      const candidates = scanFields(ownerDocument);
      const classified = candidates.map((candidate) => ({
        candidate,
        classification: getFieldClassification(candidate),
      }));
      const fieldKeys = [
        ...new Set(
          classified.flatMap(({ classification }) =>
            classification.kind === "ready" || classification.kind === "uncertain"
              ? [classification.fieldKey]
              : [],
          ),
        ),
      ];
      const rawValues =
        fieldKeys.length > 0
          ? await sendMessage({
              type: "GET_FILL_VALUES",
              fieldKeys,
              host: ownerDocument.location?.hostname ?? "",
            })
          : { values: {} };

      if (disposed || sequence !== refreshSequence) {
        return;
      }

      const values = parseFillValues(rawValues);
      fields = classified.map(({ candidate, classification }): OverlayField => {
        if (classification.kind === "forbidden" || classification.kind === "blocked_by_setting") {
          return { candidate, status: "blocked" };
        }

        if (classification.kind === "ready" || classification.kind === "uncertain") {
          const suggestion = values[classification.fieldKey];
          if (typeof suggestion === "string") {
            return {
              candidate,
              fieldKey: classification.fieldKey,
              status: classification.kind,
              suggestion,
            };
          }
        }

        return { candidate, status: "open" };
      });
      renderFields();
      announce(fields.length === 0 ? ptBr.overlayNoFields : ptBr.overlayLoaded);
    } catch {
      if (!disposed && sequence === refreshSequence) {
        announce(ptBr.overlayLoadFailed);
      }
    }
  }

  function dispose(): void {
    if (disposed) {
      return;
    }
    disposed = true;
    refreshSequence += 1;
    observer?.disconnect();
    ownerDocument.removeEventListener("focusin", handleFocusIn, true);
    ownerDocument.removeEventListener("keydown", handleKeyDown);
    if (refreshTimer !== undefined) {
      ownerDocument.defaultView?.clearTimeout(refreshTimer);
    }
    host.remove();
    onClose?.();
  }

  const observer = ownerDocument.defaultView
    ? new ownerDocument.defaultView.MutationObserver(scheduleRefresh)
    : undefined;
  observer?.observe(ownerDocument.body, { attributes: true, childList: true, subtree: true });
  ownerDocument.addEventListener("focusin", handleFocusIn, true);
  ownerDocument.addEventListener("keydown", handleKeyDown);

  return { refresh, dispose };
}
