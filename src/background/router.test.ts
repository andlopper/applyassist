import { describe, expect, it, vi } from "vitest";
import { registerMessageRouter, type MessageListener, type RuntimeSender } from "./router";

class FakeChromeRuntime {
  readonly id = "extension-id";
  private listener: MessageListener | undefined;

  readonly onMessage = {
    addListener: (listener: MessageListener) => {
      this.listener = listener;
    },
    removeListener: (listener: MessageListener) => {
      if (this.listener === listener) {
        this.listener = undefined;
      }
    },
  };

  send(message: unknown, sender: RuntimeSender): void {
    this.listener?.(message, sender);
  }
}

describe("R-01/R-17 background runtime message router", () => {
  it("dispatches a schema-valid message from this extension's content script", () => {
    const runtime = new FakeChromeRuntime();
    const dispatch = vi.fn();
    registerMessageRouter(runtime, dispatch);

    const message = { type: "GET_MAPPINGS", host: "jobs.example.org" };
    runtime.send(message, { id: runtime.id, tab: { id: 2 } });

    expect(dispatch).toHaveBeenCalledWith(message, { id: runtime.id, tab: { id: 2 } });
  });

  it("ignores messages from another extension", () => {
    const runtime = new FakeChromeRuntime();
    const dispatch = vi.fn();
    registerMessageRouter(runtime, dispatch);

    runtime.send(
      { type: "GET_MAPPINGS", host: "example.org" },
      { id: "other-extension", tab: { id: 2 } },
    );

    expect(dispatch).not.toHaveBeenCalled();
  });

  it("ignores content messages without a tab sender", () => {
    const runtime = new FakeChromeRuntime();
    const dispatch = vi.fn();
    registerMessageRouter(runtime, dispatch);

    runtime.send({ type: "GET_MAPPINGS", host: "example.org" }, { id: runtime.id });

    expect(dispatch).not.toHaveBeenCalled();
  });

  it("accepts side-panel AI requests without a tab sender", () => {
    const runtime = new FakeChromeRuntime();
    const dispatch = vi.fn();
    registerMessageRouter(runtime, dispatch);
    const message = {
      type: "AI_ABORT",
      requestId: "request-1",
    };

    runtime.send(message, { id: runtime.id });

    expect(dispatch).toHaveBeenCalledWith(message, { id: runtime.id });
  });

  it("ignores known message types with an invalid payload schema", () => {
    const runtime = new FakeChromeRuntime();
    const dispatch = vi.fn();
    registerMessageRouter(runtime, dispatch);

    runtime.send({ type: "GET_MAPPINGS", host: 42 }, { id: runtime.id, tab: { id: 2 } });

    expect(dispatch).not.toHaveBeenCalled();
  });

  it("ignores unknown message types and logs only the type", () => {
    const runtime = new FakeChromeRuntime();
    const dispatch = vi.fn();
    const debug = vi.spyOn(console, "debug").mockImplementation(() => undefined);
    registerMessageRouter(runtime, dispatch);

    runtime.send({ type: "UNKNOWN", secret: "must not be logged" }, { id: runtime.id });

    expect(dispatch).not.toHaveBeenCalled();
    expect(debug).toHaveBeenCalledWith("Ignoring unknown runtime message type", "UNKNOWN");
    expect(JSON.stringify(debug.mock.calls)).not.toContain("must not be logged");
    debug.mockRestore();
  });

  it("removes its listener when the returned disposer is called", () => {
    const runtime = new FakeChromeRuntime();
    const dispatch = vi.fn();
    const dispose = registerMessageRouter(runtime, dispatch);

    dispose();
    runtime.send({ type: "GET_MAPPINGS", host: "example.org" }, { id: runtime.id, tab: { id: 2 } });

    expect(dispatch).not.toHaveBeenCalled();
  });
});
