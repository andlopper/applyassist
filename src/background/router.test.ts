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

  send(
    message: unknown,
    sender: RuntimeSender,
    sendResponse?: (response?: unknown) => void,
  ): boolean | void {
    return this.listener?.(message, sender, sendResponse);
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

  it("returns an asynchronous dispatch response to the content script", async () => {
    const runtime = new FakeChromeRuntime();
    const dispatch = vi.fn(async () => ({ values: { email: "ana@example.test" } }));
    registerMessageRouter(runtime, dispatch);
    const sendResponse = vi.fn();

    const keepChannelOpen = runtime.send(
      { type: "GET_FILL_VALUES", fieldKeys: ["email"], host: "example.org" },
      { id: runtime.id, tab: { id: 2 } },
      sendResponse,
    );

    expect(keepChannelOpen).toBe(true);
    await vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalledWith({ values: { email: "ana@example.test" } });
    });
  });

  it("returns an explicit error response when asynchronous dispatch fails", async () => {
    const runtime = new FakeChromeRuntime();
    const dispatch = vi.fn(async () => {
      throw new Error("storage failure");
    });
    registerMessageRouter(runtime, dispatch);
    const sendResponse = vi.fn();

    runtime.send(
      { type: "GET_FILL_VALUES", fieldKeys: ["email"], host: "example.org" },
      { id: runtime.id, tab: { id: 2 } },
      sendResponse,
    );

    await vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalledWith({ error: true });
    });
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

  it("accepts AI availability requests from the active content tab", () => {
    const runtime = new FakeChromeRuntime();
    const dispatch = vi.fn();
    registerMessageRouter(runtime, dispatch);
    const message = { type: "AI_STATUS" };

    runtime.send(message, { id: runtime.id, tab: { id: 2 } });

    expect(dispatch).toHaveBeenCalledWith(message, { id: runtime.id, tab: { id: 2 } });
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
