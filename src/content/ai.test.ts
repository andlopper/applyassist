import { describe, expect, it, vi } from "vitest";
import type { AiGenerationPortCommand } from "../shared/messages";
import {
  createAiGenerator,
  type AiGenerationPort,
} from "./ai";

class FakeAiGenerationPort implements AiGenerationPort {
  readonly postedMessages: AiGenerationPortCommand[] = [];
  readonly disconnected = vi.fn();
  private readonly messageListeners = new Set<(message: unknown) => void>();
  private readonly disconnectListeners = new Set<() => void>();

  readonly onMessage = {
    addListener: (listener: (message: unknown) => void): void => {
      this.messageListeners.add(listener);
    },
    removeListener: (listener: (message: unknown) => void): void => {
      this.messageListeners.delete(listener);
    },
  };
  readonly onDisconnect = {
    addListener: (listener: () => void): void => {
      this.disconnectListeners.add(listener);
    },
    removeListener: (listener: () => void): void => {
      this.disconnectListeners.delete(listener);
    },
  };

  postMessage(message: AiGenerationPortCommand): void {
    this.postedMessages.push(message);
  }

  disconnect(): void {
    this.disconnected();
  }

  emitDisconnect(): void {
    for (const listener of this.disconnectListeners) {
      listener();
    }
  }

  emit(message: unknown): void {
    for (const listener of this.messageListeners) {
      listener(message);
    }
  }
}

describe("content AI port client", () => {
  it("streams chunks from the background port and disconnects on completion", async () => {
    const port = new FakeAiGenerationPort();
    const generate = createAiGenerator(() => port);
    const onChunk = vi.fn();
    const result = generate(
      { type: "AI_GENERATE", question: "Conte sobre sua experiência", language: "pt" },
      new AbortController().signal,
      onChunk,
    );

    port.emit({ type: "AI_CHUNK", text: "Tenho " });
    port.emit({ type: "AI_CHUNK", text: "experiência." });
    port.emit({ type: "AI_DONE" });

    await expect(result).resolves.toBeUndefined();
    expect(onChunk.mock.calls).toEqual([["Tenho "], ["experiência."]]);
    expect(port.postedMessages).toEqual([
      { type: "AI_GENERATE", question: "Conte sobre sua experiência", language: "pt" },
    ]);
    expect(port.disconnected).toHaveBeenCalledOnce();
  });

  it("sends an abort command when the user cancels generation", async () => {
    const port = new FakeAiGenerationPort();
    const generate = createAiGenerator(() => port);
    const controller = new AbortController();
    const result = generate(
      { type: "AI_GENERATE", question: "Why?", language: "en" },
      controller.signal,
      vi.fn(),
    );

    controller.abort();

    await expect(result).rejects.toMatchObject({ name: "AbortError" });
    expect(port.postedMessages).toEqual([
      { type: "AI_GENERATE", question: "Why?", language: "en" },
      { type: "AI_ABORT" },
    ]);
    expect(port.disconnected).toHaveBeenCalledOnce();
  });

  it("maps a daily-limit event to a typed error", async () => {
    const port = new FakeAiGenerationPort();
    const generate = createAiGenerator(() => port);
    const result = generate(
      { type: "AI_GENERATE", question: "Why?", language: "en" },
      new AbortController().signal,
      vi.fn(),
    );

    port.emit({ type: "AI_ERROR", code: "daily-limit" });

    await expect(result).rejects.toMatchObject({ name: "Error", code: "daily-limit" });
  });

  it("rejects malformed port events without exposing their payload", async () => {
    const port = new FakeAiGenerationPort();
    const generate = createAiGenerator(() => port);
    const result = generate(
      { type: "AI_GENERATE", question: "Why?", language: "en" },
      new AbortController().signal,
      vi.fn(),
    );

    port.emit({ type: "AI_CHUNK", text: 42 });

    await expect(result).rejects.toThrow("invalid response");
  });

  it("rejects when the background disconnects before completion", async () => {
    const port = new FakeAiGenerationPort();
    const generate = createAiGenerator(() => port);
    const result = generate(
      { type: "AI_GENERATE", question: "Why?", language: "en" },
      new AbortController().signal,
      vi.fn(),
    );

    port.emitDisconnect();

    await expect(result).rejects.toThrow("closed unexpectedly");
  });

  it("does not open a port for a request whose signal is already aborted", async () => {
    const connect = vi.fn(() => new FakeAiGenerationPort());
    const generate = createAiGenerator(connect);
    const controller = new AbortController();
    controller.abort();

    await expect(
      generate(
        { type: "AI_GENERATE", question: "Why?", language: "en" },
        controller.signal,
        vi.fn(),
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(connect).not.toHaveBeenCalled();
  });

  it("maps an explicit cancellation event to AbortError", async () => {
    const port = new FakeAiGenerationPort();
    const generate = createAiGenerator(() => port);
    const result = generate(
      { type: "AI_GENERATE", question: "Why?", language: "en" },
      new AbortController().signal,
      vi.fn(),
    );

    port.emit({ type: "AI_CANCELLED" });

    await expect(result).rejects.toMatchObject({ name: "AbortError" });
  });
});
