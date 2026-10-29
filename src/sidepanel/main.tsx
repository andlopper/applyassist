import { render } from "preact";
import { useEffect, useMemo, useState } from "preact/hooks";
import { createAiGenerator } from "../content/ai";
import { ptBr } from "../shared/i18n/pt-br";
import type { AiGenerationPortCommand } from "../shared/messages";

declare const chrome:
  | {
      runtime?: {
        sendMessage?: (
          message: unknown,
          responseCallback?: (response?: unknown) => void,
        ) => void | Promise<unknown>;
        connect?: (info: { name: string }) => {
          postMessage(message: AiGenerationPortCommand): void;
          disconnect(): void;
          onMessage: {
            addListener(listener: (message: unknown) => void): void;
            removeListener(listener: (message: unknown) => void): void;
          };
          onDisconnect: {
            addListener(listener: () => void): void;
            removeListener(listener: () => void): void;
          };
        };
      };
    }
  | undefined;

type RuntimeStatus = { available?: boolean };

function detectLanguage(question: string): "pt" | "en" | "es" {
  const lowered = question.toLocaleLowerCase("pt-BR");
  if (/[¿?]|\b(que|como|por que|porque|donde|cuando|quien|puedes|necesitas)\b/.test(lowered)) {
    return "es";
  }
  if (/\b(the|why|where|when|which|how|your|please|experience|role|company)\b/.test(lowered)) {
    return "en";
  }
  return "pt";
}

async function getAiStatus(): Promise<boolean> {
  const runtime = chrome?.runtime;
  const sendMessage = runtime?.sendMessage;
  if (typeof sendMessage !== "function") {
    return false;
  }

  return await new Promise<boolean>((resolve) => {
    const callback = (value?: unknown) => {
      if (typeof value === "object" && value !== null && "available" in value) {
        resolve(Boolean((value as RuntimeStatus).available));
        return;
      }
      resolve(false);
    };

    const result = sendMessage({ type: "AI_STATUS" }, callback);
    if (result instanceof Promise) {
      void result.then((value) => callback(value as unknown)).catch(() => resolve(false));
    }
  });
}

function isRuntimePort(value: unknown): value is {
  postMessage(message: AiGenerationPortCommand): void;
  disconnect(): void;
  onMessage: {
    addListener(listener: (message: unknown) => void): void;
    removeListener(listener: (message: unknown) => void): void;
  };
  onDisconnect: {
    addListener(listener: () => void): void;
    removeListener(listener: () => void): void;
  };
} {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const port = value as {
    postMessage?: (message: AiGenerationPortCommand) => void;
    disconnect?: () => void;
    onMessage?: {
      addListener?: (listener: (message: unknown) => void) => void;
      removeListener?: (listener: (message: unknown) => void) => void;
    };
    onDisconnect?: {
      addListener?: (listener: () => void) => void;
      removeListener?: (listener: () => void) => void;
    };
  };

  return (
    typeof port.postMessage === "function" &&
    typeof port.disconnect === "function" &&
    typeof port.onMessage?.addListener === "function" &&
    typeof port.onMessage?.removeListener === "function" &&
    typeof port.onDisconnect?.addListener === "function" &&
    typeof port.onDisconnect?.removeListener === "function"
  );
}

export function SidePanelApp() {
  const [question, setQuestion] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [output, setOutput] = useState("");
  const [isAvailable, setIsAvailable] = useState(false);
  const [status, setStatus] = useState<string>(ptBr.sidepanelAiUnavailable);
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    void getAiStatus().then((available) => {
      setIsAvailable(available);
      setStatus(available ? ptBr.sidepanelReady : ptBr.sidepanelAiUnavailable);
    });
  }, []);

  const canGenerate = useMemo(
    () => !isGenerating && isAvailable && question.trim().length > 0,
    [isAvailable, isGenerating, question],
  );

  const handleGenerate = async (): Promise<void> => {
    const runtime = chrome?.runtime;
    if (!runtime?.connect || !canGenerate) {
      if (!question.trim()) {
        setStatus(ptBr.sidepanelQuestionRequired);
      } else {
        setStatus(ptBr.sidepanelAiUnavailable);
      }
      return;
    }

    const runtimePort = runtime.connect({ name: "AI_GENERATE" });
    if (!isRuntimePort(runtimePort)) {
      setStatus(ptBr.sidepanelAiUnavailable);
      return;
    }

    setIsGenerating(true);
    setStatus(ptBr.sidepanelGenerating);
    setOutput("");

    try {
      const generator = createAiGenerator(() => runtimePort);
      const controller = new AbortController();
      await generator(
        {
          type: "AI_GENERATE",
          question: question.trim(),
          language: detectLanguage(question),
          maxLength: 2000,
          selectedText: jobDescription.trim() || undefined,
        },
        controller.signal,
        (chunk) => {
          setOutput((previous) => previous + chunk);
        },
      );
      setStatus(ptBr.sidepanelGenerated);
    } catch {
      setStatus(ptBr.sidepanelAiUnavailable);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = async (): Promise<void> => {
    if (!output.trim()) {
      return;
    }

    if (typeof navigator !== "undefined" && typeof navigator.clipboard?.writeText === "function") {
      try {
        await navigator.clipboard.writeText(output);
        setStatus(ptBr.sidepanelCopied);
      } catch {
        setStatus(ptBr.sidepanelAiUnavailable);
      }
      return;
    }

    setStatus(ptBr.sidepanelAiUnavailable);
  };

  return (
    <main
      style={{
        fontFamily: "sans-serif",
        color: "#111827",
        background: "#f8fafc",
        minHeight: "100vh",
        padding: "1rem",
      }}
    >
      <h1 style={{ margin: "0 0 1rem", fontSize: "1.5rem" }}>{ptBr.sidepanelTitle}</h1>

      <div style={{ display: "grid", gap: "0.75rem" }}>
        <label style={{ display: "grid", gap: "0.25rem", fontWeight: 600 }}>
          {ptBr.sidepanelQuestion}
          <textarea
            aria-label={ptBr.sidepanelQuestion}
            rows={4}
            value={question}
            onInput={(event) => setQuestion((event.target as HTMLTextAreaElement).value)}
            style={{
              padding: "0.5rem",
              borderRadius: "0.5rem",
              border: "1px solid #cbd5e1",
              resize: "vertical",
            }}
          />
        </label>

        <label style={{ display: "grid", gap: "0.25rem", fontWeight: 600 }}>
          {ptBr.sidepanelJobDescription}
          <textarea
            aria-label={ptBr.sidepanelJobDescription}
            rows={6}
            value={jobDescription}
            onInput={(event) => setJobDescription((event.target as HTMLTextAreaElement).value)}
            style={{
              padding: "0.5rem",
              borderRadius: "0.5rem",
              border: "1px solid #cbd5e1",
              resize: "vertical",
            }}
          />
        </label>

        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => {
              void handleGenerate();
            }}
            disabled={!canGenerate}
            style={{
              background: canGenerate ? "#2563eb" : "#cbd5e1",
              color: canGenerate ? "#fff" : "#475569",
              border: "none",
              borderRadius: "0.5rem",
              padding: "0.625rem 1rem",
              cursor: canGenerate ? "pointer" : "not-allowed",
            }}
          >
            {ptBr.sidepanelGenerate}
          </button>

          <button
            type="button"
            onClick={() => {
              void handleCopy();
            }}
            disabled={!output.trim()}
            style={{
              background: output.trim() ? "#0f172a" : "#cbd5e1",
              color: output.trim() ? "#fff" : "#475569",
              border: "none",
              borderRadius: "0.5rem",
              padding: "0.625rem 1rem",
              cursor: output.trim() ? "pointer" : "not-allowed",
            }}
          >
            {ptBr.sidepanelCopy}
          </button>
        </div>

        <p style={{ margin: 0, minHeight: "1.5rem", color: "#334155" }}>{status}</p>

        <label style={{ display: "grid", gap: "0.25rem", fontWeight: 600 }}>
          {ptBr.sidepanelOutput}
          <textarea
            aria-label={ptBr.sidepanelOutput}
            rows={8}
            value={output}
            onInput={(event) => setOutput((event.target as HTMLTextAreaElement).value)}
            placeholder={ptBr.sidepanelEmpty}
            style={{
              padding: "0.5rem",
              borderRadius: "0.5rem",
              border: "1px solid #cbd5e1",
              resize: "vertical",
            }}
          />
        </label>
      </div>
    </main>
  );
}

const root = document.getElementById("app");
if (root) {
  render(<SidePanelApp />, root);
}
