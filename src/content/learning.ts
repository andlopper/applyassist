import { classifyFieldLabel } from "../core/matching";
import { normalizeLabel } from "../core/normalize";
import type { RuntimeMessage } from "../shared/messages";
import { scanFields, type FieldCandidate } from "./scanner";

type LearningEventMessage = Extract<RuntimeMessage, { type: "LEARN_EVENT" }>;
type LearningEventSender = (message: LearningEventMessage) => Promise<unknown>;

function createLearningMessage(candidate: FieldCandidate): LearningEventMessage | undefined {
  const element = candidate.element;
  const type = element.type;
  const autocomplete = element.autocomplete;
  const maxlength =
    element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement
      ? element.maxLength
      : undefined;
  const classification = classifyFieldLabel({
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
  if (classification.kind === "forbidden" || classification.kind === "blocked_by_setting") {
    return undefined;
  }

  const value = element.value;
  const labelNorm = normalizeLabel(candidate.label);
  if (!value.trim() || !labelNorm) {
    return undefined;
  }

  return {
    type: "LEARN_EVENT",
    labelNorm,
    value,
    kind: classification.kind === "open_text" ? "open_text" : "short",
    ...(classification.kind === "ready" || classification.kind === "uncertain"
      ? { fieldKey: classification.fieldKey }
      : {}),
    host: element.ownerDocument.location.hostname,
  };
}

function sendLearningEvent(
  candidate: FieldCandidate,
  sendMessage: LearningEventSender,
): void {
  const message = createLearningMessage(candidate);
  if (!message) {
    return;
  }

  void sendMessage(message).catch(() => {
    console.warn("Unable to record a learning event.");
  });
}

export function mountLearningCapture(
  ownerDocument: Document,
  sendMessage: LearningEventSender,
): () => void {
  let mounted = true;

  function handleFocusOut(event: FocusEvent): void {
    if (!mounted || !(event.target instanceof Element)) {
      return;
    }
    const candidate = scanFields(ownerDocument).find(
      (field) => field.element === event.target,
    );
    if (candidate) {
      sendLearningEvent(candidate, sendMessage);
    }
  }

  function handleSubmit(event: SubmitEvent): void {
    if (!mounted || !(event.target instanceof HTMLFormElement)) {
      return;
    }
    for (const candidate of scanFields(ownerDocument)) {
      if (candidate.element.form === event.target) {
        sendLearningEvent(candidate, sendMessage);
      }
    }
  }

  ownerDocument.addEventListener("focusout", handleFocusOut, true);
  ownerDocument.addEventListener("submit", handleSubmit, true);

  return () => {
    if (!mounted) {
      return;
    }
    mounted = false;
    ownerDocument.removeEventListener("focusout", handleFocusOut, true);
    ownerDocument.removeEventListener("submit", handleSubmit, true);
  };
}
