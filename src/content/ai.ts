import type {
  AiGenerationCommand,
  AiGenerationPortCommand,
  AiGenerationPortEvent,
} from "../shared/messages";

export interface AiGenerationPort {
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
}

export type AiGenerator = (
  command: AiGenerationCommand,
  signal: AbortSignal,
  onChunk: (text: string) => void,
) => Promise<void>;

export class AiGenerationError extends Error {
  constructor(readonly code: "daily-limit" | "unavailable") {
    super(code);
  }
}

function isAiGenerationPortEvent(value: unknown): value is AiGenerationPortEvent {
  if (typeof value !== "object" || value === null || !("type" in value)) {
    return false;
  }

  const event = value as Record<string, unknown>;
  if (event.type === "AI_CHUNK") {
    return (
      Object.keys(event).every((key) => key === "type" || key === "text") &&
      typeof event.text === "string"
    );
  }
  if (event.type === "AI_DONE" || event.type === "AI_CANCELLED") {
    return Object.keys(event).length === 1;
  }
  return (
    event.type === "AI_ERROR" &&
    (event.code === "daily-limit" || event.code === "unavailable") &&
    Object.keys(event).length === 2
  );
}

export function createAiGenerator(connect: () => AiGenerationPort): AiGenerator {
  return (command, signal, onChunk) =>
    new Promise((resolve, reject) => {
      if (signal.aborted) {
        reject(new DOMException("The operation was aborted.", "AbortError"));
        return;
      }

      const port = connect();
      let settled = false;

      const cleanup = (): void => {
        signal.removeEventListener("abort", handleAbort);
        port.onMessage.removeListener(handleMessage);
        port.onDisconnect.removeListener(handleDisconnect);
      };

      const finish = (error?: Error): void => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        port.disconnect();
        if (error) {
          reject(error);
          return;
        }
        resolve();
      };

      const handleAbort = (): void => {
        port.postMessage({ type: "AI_ABORT" });
        finish(new DOMException("The operation was aborted.", "AbortError"));
      };

      const handleDisconnect = (): void => {
        finish(
          signal.aborted
            ? new DOMException("The operation was aborted.", "AbortError")
            : new Error("The AI connection closed unexpectedly."),
        );
      };

      const handleMessage = (message: unknown): void => {
        if (!isAiGenerationPortEvent(message)) {
          finish(new Error("The AI connection returned an invalid response."));
          return;
        }

        switch (message.type) {
          case "AI_CHUNK":
            onChunk(message.text);
            return;
          case "AI_DONE":
            finish();
            return;
          case "AI_CANCELLED":
            finish(new DOMException("The operation was aborted.", "AbortError"));
            return;
          case "AI_ERROR":
            finish(new AiGenerationError(message.code));
            return;
        }
      };

      signal.addEventListener("abort", handleAbort, { once: true });
      port.onMessage.addListener(handleMessage);
      port.onDisconnect.addListener(handleDisconnect);
      port.postMessage(command);
    });
}
