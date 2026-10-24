import { describe, expect, it, vi } from "vitest";
import { toggleContentSession } from "./main";

describe("content script activation", () => {
  it("activates on first injection and deactivates on the second injection", () => {
    const isolatedWorld = {};
    const onToggle = vi.fn();

    expect(toggleContentSession(isolatedWorld, onToggle)).toBe(true);
    expect(toggleContentSession(isolatedWorld, onToggle)).toBe(false);
    expect(onToggle.mock.calls).toEqual([[true], [false]]);
  });
});
