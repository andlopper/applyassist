import {
  classifyFieldLabel,
  type FieldClassificationResult,
  type LearnedMapping,
} from "../../core/matching";
import { FIELD_KEYS, type FieldKey } from "../../core/matching/field-key";
import { fillField, undoFieldFill, type FillResult } from "../filler";
import { scanFields, type FieldCandidate } from "../scanner";
import { ptBr } from "../../shared/i18n/pt-br";
import type { RuntimeMessage } from "../../shared/messages";
import { AiGenerationError, type AiGenerator } from "../ai";

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
      status: "open";
    }
  | {
      candidate: FieldCandidate;
      status: "blocked";
    };

export type OverlayMessageSender = (message: RuntimeMessage) => Promise<unknown>;

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
    display: flex;
    flex-direction: column;
    height: min(50vh, 500px);
    max-height: calc(100vh - 32px);
    overflow: hidden;
    padding: 14px;
    width: min(600px, calc(100vw - 32px));
  }
  .heading, .actions, .counts, .field-heading {
    align-items: center;
    display: flex;
    gap: 8px;
    justify-content: space-between;
  }
  .heading { align-items: center; border-bottom: 1px solid #d5dde4; display: flex; flex: 0 0 auto; gap: 8px; justify-content: space-between; padding-bottom: 10px; }
  .content { flex: 1 1 auto; min-height: 0; overflow-y: auto; overscroll-behavior: contain; }
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
  .generated-answer { background: #f3f6f8; border-radius: 6px; padding: 8px; white-space: pre-wrap; }
  .field-actions { display: flex; flex-wrap: wrap; gap: 8px; }
  .footer { background: #fff; border-top: 1px solid #d5dde4; display: flex; flex: 0 0 auto; flex-direction: column; gap: 8px; padding-top: 10px; }
  .actions { display: grid; gap: 8px; grid-template-columns: 1fr; }
  .action-group { display: grid; gap: 8px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .actions button { min-height: 40px; min-width: 0; padding-left: 4px; padding-right: 4px; white-space: nowrap; width: 100%; }
  .loading { align-items: center; display: inline-flex; gap: 8px; justify-content: center; }
  .live { min-height: 1.45em; }
  .field-chip { margin-top: 8px; }
  .ai-controls { display: grid; gap: 8px; margin-top: 12px; }
  .ai-selection { align-items: flex-start; display: flex; gap: 8px; }
  .loading-spinner { animation: applyassist-spin .8s linear infinite; border: 2px solid currentColor; border-right-color: transparent; border-radius: 50%; display: inline-block; flex: 0 0 14px; height: 14px; vertical-align: middle; width: 14px; }
  @keyframes applyassist-spin { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) {
    .loading-spinner { animation: none; }
  }
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

function parseAiAvailability(response: unknown): boolean {
  if (!isRecord(response) || typeof response.available !== "boolean") {
    throw new Error("Invalid AI_STATUS response.");
  }
  return response.available;
}

function parseLearnedMappings(response: unknown): Record<string, LearnedMapping> {
  if (!isRecord(response) || response.error === true || !isRecord(response.mappings)) {
    throw new Error("Invalid GET_MAPPINGS response.");
  }

  const mappings: Record<string, LearnedMapping> = {};
  for (const [labelNorm, value] of Object.entries(response.mappings)) {
    if (
      !isRecord(value) ||
      typeof value.fieldKey !== "string" ||
      !FIELD_KEYS.some((fieldKey) => fieldKey === value.fieldKey) ||
      typeof value.reviewed !== "boolean" ||
      (value.host !== undefined && typeof value.host !== "string")
    ) {
      throw new Error("Invalid learned mapping.");
    }

    const fieldKey = FIELD_KEYS.find((knownKey) => knownKey === value.fieldKey);
    if (!fieldKey) {
      throw new Error("Invalid learned mapping field key.");
    }
    mappings[labelNorm] = {
      fieldKey,
      reviewed: value.reviewed,
      ...(typeof value.host === "string" ? { host: value.host } : {}),
    };
  }
  return mappings;
}

function getFieldClassification(
  candidate: FieldCandidate,
  host: string,
  learnedMappings: Record<string, LearnedMapping>,
): FieldClassificationResult {
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
    host,
    learnedMappings,
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

function canGenerateForField(
  field: OverlayField,
): field is Extract<OverlayField, { status: "open" }> {
  if (field.status !== "open") {
    return false;
  }
  const element = field.candidate.element;
  return (
    element instanceof HTMLTextAreaElement ||
    (element instanceof HTMLInputElement && (element.type === "text" || element.type === "search"))
  );
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

function awaitWithAbort(promise: Promise<void>, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const handleAbort = (): void => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      reject(new DOMException("The operation was aborted.", "AbortError"));
    };
    const cleanup = (): void => signal.removeEventListener("abort", handleAbort);
    signal.addEventListener("abort", handleAbort, { once: true });
    promise.then(
      () => {
        cleanup();
        if (!settled) {
          settled = true;
          resolve();
        }
      },
      (error: unknown) => {
        cleanup();
        if (!settled) {
          settled = true;
          reject(error);
        }
      },
    );
    if (signal.aborted) {
      handleAbort();
    }
  });
}

export function mountOverlay(
  ownerDocument: Document,
  sendMessage: OverlayMessageSender,
  onClose?: () => void,
  generateAi?: AiGenerator,
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

  const content = ownerDocument.createElement("div");
  content.className = "content";

  const heading = ownerDocument.createElement("div");
  heading.className = "heading";
  const title = ownerDocument.createElement("h2");
  title.id = "applyassist-title";
  title.textContent = ptBr.overlayTitle;
  heading.append(title);

  const closeButton = createButton(ownerDocument, ptBr.overlayClose, "close", () => dispose());
  closeButton.className = "close";
  closeButton.setAttribute("aria-label", ptBr.overlayClose);
  heading.append(closeButton);
  panel.append(heading, content);

  const counts = ownerDocument.createElement("div");
  counts.className = "counts";
  counts.setAttribute("aria-label", ptBr.overlayCounts);
  content.append(counts);

  const chip = createButton(ownerDocument, "", "chip", () => {
    if (focusedField) {
      applySuggestion(focusedField);
    }
  });
  chip.className = "field-chip";
  chip.hidden = true;
  content.append(chip);

  const status = ownerDocument.createElement("p");
  status.className = "live";
  status.setAttribute("aria-live", "polite");
  status.setAttribute("role", "status");
  status.textContent = ptBr.overlayLoading;
  content.append(status);

  const aiControls = ownerDocument.createElement("div");
  aiControls.className = "ai-controls";
  aiControls.hidden = true;
  const selectedTextLabel = ownerDocument.createElement("label");
  selectedTextLabel.className = "ai-selection";
  const selectedTextCheckbox = ownerDocument.createElement("input");
  selectedTextCheckbox.type = "checkbox";
  selectedTextCheckbox.dataset.action = "use-selected-text";
  const selectedTextDescription = ownerDocument.createElement("span");
  selectedTextDescription.textContent = ptBr.overlayAiUseSelection;
  selectedTextLabel.append(selectedTextCheckbox, selectedTextDescription);
  const languageSelect = ownerDocument.createElement("select");
  languageSelect.setAttribute("aria-label", ptBr.overlayAiLanguage);
  for (const [value, label] of [
    ["pt", ptBr.overlayAiLanguagePt],
    ["en", ptBr.overlayAiLanguageEn],
    ["es", ptBr.overlayAiLanguageEs],
  ] as const) {
    const option = ownerDocument.createElement("option");
    option.value = value;
    option.textContent = label;
    languageSelect.append(option);
  }
  aiControls.append(selectedTextLabel, languageSelect);
  content.append(aiControls);

  const fieldsList = ownerDocument.createElement("ul");
  fieldsList.className = "fields";
  content.append(fieldsList);

  const footer = ownerDocument.createElement("div");
  footer.className = "footer";
  const actions = ownerDocument.createElement("div");
  actions.className = "actions";
  const generationActions = ownerDocument.createElement("div");
  generationActions.className = "action-group";
  const generateAllButton = createButton(
    ownerDocument,
    ptBr.overlayGenerateAll,
    "generate-all",
    () => void generateAllFields(),
  );
  const cancelAiButton = createButton(ownerDocument, ptBr.overlayCancel, "cancel-ai", () => {
    cancelGenerateAll = true;
    discardActiveGeneration = true;
    activeAiGeneration?.abort();
  });
  cancelAiButton.disabled = true;
  generationActions.append(generateAllButton, cancelAiButton);

  const fillActions = ownerDocument.createElement("div");
  fillActions.className = "action-group";
  const applyReadyButton = createButton(
    ownerDocument,
    ptBr.overlayApplyReady,
    "apply-ready",
    applyReadyFields,
  );
  const undoButton = createButton(ownerDocument, ptBr.overlayUndo, "undo", undoLast);
  undoButton.disabled = true;
  fillActions.append(applyReadyButton, undoButton);
  actions.append(generationActions, fillActions);
  footer.append(actions);
  panel.append(footer);
  shadowRoot.append(panel);
  ownerDocument.body.append(host);

  let fields: OverlayField[] = [];
  let focusedField: OverlayField | undefined;
  let disposed = false;
  let aiAvailable = false;
  let activeAiGeneration: AbortController | undefined;
  let activeAiElement: Element | undefined;
  let isGeneratingAll = false;
  let cancelGenerateAll = false;
  let discardActiveGeneration = false;
  const generatedAnswers = new Map<Element, string>();
  const generatedAnswerNodes = new Map<Element, HTMLParagraphElement>();
  const completedGeneratedAnswers = new Set<Element>();
  const individualUndo = new Map<Element, FillResult>();
  let lastBatchResults: FillResult[] = [];
  let lastBatchGeneratedAnswers = new Set<Element>();
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
      const generatedAnswer =
        field.status === "open" ? generatedAnswers.get(field.candidate.element) : undefined;
      generatedAnswerNodes.set(field.candidate.element, suggestion);
      suggestion.textContent =
        field.status === "ready" || field.status === "uncertain"
          ? truncate(field.suggestion, MAX_SUGGESTION_LENGTH)
          : (generatedAnswer ?? ptBr.overlayNoSuggestion);
      if (generatedAnswer) {
        suggestion.classList.add("generated-answer");
      }
      item.append(suggestion);
      const fieldActions = ownerDocument.createElement("div");
      fieldActions.className = "field-actions";

      if (field.status === "ready" || field.status === "uncertain") {
        const appliedResult = individualUndo.get(field.candidate.element);
        if (appliedResult) {
          fieldActions.append(
            createButton(ownerDocument, ptBr.overlayUndo, "undo-field", () =>
              undoIndividualField(field.candidate.element),
            ),
          );
        } else {
          fieldActions.append(
            createButton(ownerDocument, ptBr.overlayApply, "apply", () => applySuggestion(field)),
          );
        }
      } else if (canGenerateForField(field) && aiAvailable && generateAi) {
        const generatingThisField = activeAiElement === field.candidate.element;
        const generatedIsComplete = completedGeneratedAnswers.has(field.candidate.element);
        const appliedResult = individualUndo.get(field.candidate.element);
        if (isFieldEmpty(field)) {
          const generateButton = createButton(
            ownerDocument,
            generatingThisField ? ptBr.overlayAiGenerating : ptBr.overlayGenerate,
            "generate",
            () => void generateForField(field),
          );
          generateButton.disabled = activeAiGeneration !== undefined;
          if (generatingThisField) {
            generateButton.classList.add("loading");
            const spinner = ownerDocument.createElement("span");
            spinner.className = "loading-spinner";
            spinner.setAttribute("aria-hidden", "true");
            generateButton.prepend(spinner);
            generateButton.setAttribute("aria-label", ptBr.overlayAiGenerating);
          }
          fieldActions.append(generateButton);
        }
        if (generatingThisField) {
          fieldActions.append(
            createButton(ownerDocument, ptBr.overlayCancel, "cancel-ai-field", () =>
              cancelFieldGeneration(),
            ),
          );
        }
        if (generatedAnswer && generatedIsComplete && !appliedResult) {
          fieldActions.append(
            createButton(ownerDocument, ptBr.overlayApply, "apply-generated", () =>
              applyGeneratedAnswer(field),
            ),
          );
        }
        if (appliedResult) {
          fieldActions.append(
            createButton(ownerDocument, ptBr.overlayUndo, "undo-field", () =>
              undoIndividualField(field.candidate.element),
            ),
          );
        }
      }

      item.append(fieldActions);
      fieldsList.append(item);
    }
    updateCounts();
    generateAllButton.disabled =
      !aiAvailable ||
      activeAiGeneration !== undefined ||
      !fields.some((field) => canGenerateForField(field) && isFieldEmpty(field));
    generateAllButton.replaceChildren();
    if (isGeneratingAll) {
      generateAllButton.classList.add("loading");
      const spinner = ownerDocument.createElement("span");
      spinner.className = "loading-spinner";
      spinner.setAttribute("aria-hidden", "true");
      generateAllButton.append(spinner);
      generateAllButton.setAttribute("aria-label", ptBr.overlayAiGenerating);
    } else {
      generateAllButton.classList.remove("loading");
      generateAllButton.removeAttribute("aria-label");
    }
    const generateAllLabel = ownerDocument.createElement("span");
    generateAllLabel.textContent = isGeneratingAll
      ? ptBr.overlayAiGenerating
      : ptBr.overlayGenerateAll;
    generateAllButton.append(generateAllLabel);
    cancelAiButton.disabled = !isGeneratingAll;
    applyReadyButton.disabled = !fields.some(
      (field) =>
        isFieldEmpty(field) &&
        ((field.status === "ready" && field.suggestion.length > 0) ||
          (field.status === "open" &&
            completedGeneratedAnswers.has(field.candidate.element) &&
            (generatedAnswers.get(field.candidate.element)?.length ?? 0) > 0)),
    );
    undoButton.disabled = lastBatchResults.length === 0;
  }

  function applySuggestion(field: OverlayField): FillResult | undefined {
    if (field.status !== "ready" && field.status !== "uncertain") {
      return undefined;
    }

    const result = fillField(field.candidate.element, field.suggestion);
    if (result?.applied) {
      individualUndo.set(field.candidate.element, result);
      renderFields();
      announce(ptBr.overlayApplied);
    } else {
      announce(ptBr.overlaySkipped);
    }
    return result ?? undefined;
  }

  function applyGeneratedAnswer(
    field: Extract<OverlayField, { status: "open" }>,
  ): FillResult | undefined {
    const element = field.candidate.element;
    const answer = generatedAnswers.get(element);
    if (!answer || !completedGeneratedAnswers.has(element)) {
      return undefined;
    }

    const result = fillField(element, answer);
    if (result?.applied) {
      individualUndo.set(element, result);
      renderFields();
      announce(ptBr.overlayApplied);
    } else {
      announce(ptBr.overlaySkipped);
    }
    return result ?? undefined;
  }

  function applyReadyFields(): void {
    lastBatchResults = [];
    lastBatchGeneratedAnswers = new Set();
    for (const field of fields) {
      if (!isFieldEmpty(field)) {
        continue;
      }
      const value =
        field.status === "ready"
          ? field.suggestion
          : field.status === "open" && completedGeneratedAnswers.has(field.candidate.element)
            ? generatedAnswers.get(field.candidate.element)
            : undefined;
      if (!value) {
        continue;
      }
      const result = fillField(field.candidate.element, value);
      if (result?.applied) {
        lastBatchResults.push(result);
        individualUndo.set(field.candidate.element, result);
        if (
          field.status === "open" &&
          completedGeneratedAnswers.has(field.candidate.element)
        ) {
          lastBatchGeneratedAnswers.add(field.candidate.element);
        }
      }
    }
    renderFields();
    if (lastBatchResults.length === 0) {
      announce(ptBr.overlaySkipped);
      return;
    }
    announce(ptBr.overlayApplied);
  }

  function undoLast(): void {
    if (lastBatchResults.length === 0) {
      announce(ptBr.overlayNothingToUndo);
      return;
    }

    let undone = false;
    for (const result of [...lastBatchResults].reverse()) {
      if (result.element.value === result.value) {
        const resultUndone = undoFieldFill(result.element, result.previous);
        undone = resultUndone || undone;
      }
      individualUndo.delete(result.element);
    }
    for (const element of lastBatchGeneratedAnswers) {
      generatedAnswers.delete(element);
      completedGeneratedAnswers.delete(element);
    }
    lastBatchResults = [];
    lastBatchGeneratedAnswers.clear();
    renderFields();
    announce(undone ? ptBr.overlayUndone : ptBr.overlayNothingToUndo);
  }

  function undoIndividualField(element: Element): void {
    const result = individualUndo.get(element);
    if (!result) {
      return;
    }
    const undone =
      result.element.value === result.value && undoFieldFill(result.element, result.previous);
    individualUndo.delete(element);
    lastBatchResults = lastBatchResults.filter((batchResult) => batchResult !== result);
    if (lastBatchGeneratedAnswers.delete(element)) {
      generatedAnswers.delete(element);
      completedGeneratedAnswers.delete(element);
    }
    renderFields();
    announce(undone ? ptBr.overlayUndone : ptBr.overlayNothingToUndo);
  }

  function isFieldEmpty(field: OverlayField): boolean {
    const element = field.candidate.element;
    return (
      (element instanceof HTMLInputElement ||
        element instanceof HTMLTextAreaElement ||
        element instanceof HTMLSelectElement) &&
      element.value.trim().length === 0
    );
  }

  function cancelFieldGeneration(): void {
    discardActiveGeneration = true;
    activeAiGeneration?.abort();
  }

  async function generateAllFields(): Promise<void> {
    if (!generateAi || !aiAvailable || activeAiGeneration || disposed) {
      announce(ptBr.overlayAiUnavailable);
      return;
    }

    const fieldsToGenerate = fields.filter(
      (field) => canGenerateForField(field) && isFieldEmpty(field),
    );
    if (fieldsToGenerate.length === 0) {
      announce(ptBr.overlayNoFields);
      return;
    }
    if (selectedTextCheckbox.checked && !ownerDocument.getSelection()?.toString().trim()) {
      announce(ptBr.overlayAiSelectionRequired);
      return;
    }

    isGeneratingAll = true;
    cancelGenerateAll = false;
    renderFields();
    let generatedCount = 0;
    for (const field of fieldsToGenerate) {
      if (cancelGenerateAll || disposed) {
        break;
      }
      if (field.status === "open" && isFieldEmpty(field)) {
        if (await generateForField(field)) {
          generatedCount += 1;
        }
      }
    }
    const wasCancelled = cancelGenerateAll;
    if (wasCancelled) {
      for (const field of fieldsToGenerate) {
        generatedAnswers.delete(field.candidate.element);
        completedGeneratedAnswers.delete(field.candidate.element);
      }
      renderFields();
    }
    isGeneratingAll = false;
    cancelGenerateAll = false;
    renderFields();
    if (!wasCancelled && !disposed && generatedCount === fieldsToGenerate.length) {
      announce(ptBr.overlayAiBatchGenerated);
    }
  }

  async function generateForField(
    field: Extract<OverlayField, { status: "open" }>,
  ): Promise<boolean> {
    if (!generateAi || !aiAvailable || activeAiGeneration || disposed) {
      announce(ptBr.overlayAiUnavailable);
      return false;
    }

    const selectedText = selectedTextCheckbox.checked
      ? ownerDocument.getSelection()?.toString().trim()
      : undefined;
    if (selectedTextCheckbox.checked && !selectedText) {
      announce(ptBr.overlayAiSelectionRequired);
      return false;
    }

    const controller = new AbortController();
    activeAiGeneration = controller;
    activeAiElement = field.candidate.element;
    cancelAiButton.disabled = !isGeneratingAll;
    discardActiveGeneration = false;
    generatedAnswers.delete(field.candidate.element);
    completedGeneratedAnswers.delete(field.candidate.element);
    renderFields();
    announce(ptBr.overlayAiGenerating);

    const element = field.candidate.element;
    const maxLength =
      element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement
        ? element.maxLength
        : -1;
    const command = {
      type: "AI_GENERATE" as const,
      question: field.candidate.label,
      language: languageSelect.value as "pt" | "en" | "es",
      ...(maxLength >= 0 ? { maxLength } : {}),
      ...(selectedText ? { selectedText } : {}),
    };
    let generated = "";
    let reachedMaxLength = false;

    try {
      await awaitWithAbort(generateAi(command, controller.signal, (chunk) => {
        if (disposed || controller.signal.aborted || chunk.length === 0) {
          return;
        }

        const nextValue = generated + chunk;
        const cappedValue = maxLength >= 0 ? nextValue.slice(0, maxLength) : nextValue;
        if (cappedValue.length === generated.length) {
          reachedMaxLength = true;
          controller.abort();
          return;
        }

        generated = cappedValue;
        generatedAnswers.set(element, generated);
        const answerNode = generatedAnswerNodes.get(element);
        if (answerNode) {
          answerNode.textContent = generated;
          answerNode.classList.add("generated-answer");
        }
        if (cappedValue.length < nextValue.length) {
          reachedMaxLength = true;
          controller.abort();
        }
      }), controller.signal);

      if (controller.signal.aborted) {
        announce(ptBr.overlayAiCancelled);
      } else if (generated) {
        completedGeneratedAnswers.add(element);
        announce(ptBr.overlayAiGenerated);
      } else {
        announce(ptBr.overlayAiEmpty);
      }
    } catch (error) {
      if (reachedMaxLength) {
        announce(ptBr.overlayAiMaxLength);
      } else if (error instanceof AiGenerationError && error.code === "daily-limit") {
        announce(ptBr.overlayAiDailyLimit);
      } else if (controller.signal.aborted) {
        announce(ptBr.overlayAiCancelled);
      } else {
        announce(ptBr.overlayAiUnavailable);
      }
    } finally {
      if (discardActiveGeneration) {
        generatedAnswers.delete(element);
        completedGeneratedAnswers.delete(element);
      }
      discardActiveGeneration = false;
      activeAiGeneration = undefined;
      activeAiElement = undefined;
      cancelAiButton.disabled = !isGeneratingAll;
      if (!disposed) {
        renderFields();
      }
    }
    return generated.length > 0 && completedGeneratedAnswers.has(element);
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
      const host = ownerDocument.location?.hostname ?? "";
      const [rawMappings, rawAiStatus] = await Promise.all([
        sendMessage({ type: "GET_MAPPINGS", host }),
        sendMessage({ type: "AI_STATUS" }),
      ]);
      const learnedMappings = parseLearnedMappings(rawMappings);
      aiAvailable = parseAiAvailability(rawAiStatus) && generateAi !== undefined;
      aiControls.hidden = !aiAvailable;
      const classified = candidates.map((candidate) => ({
        candidate,
        classification: getFieldClassification(candidate, host, learnedMappings),
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
              host,
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
    activeAiGeneration?.abort();
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
