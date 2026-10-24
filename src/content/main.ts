const ACTIVE_SYMBOL = Symbol.for("applyassist.active");

export function toggleContentSession(target: object, onToggle: (active: boolean) => void): boolean {
  const isActive = Object.getOwnPropertyDescriptor(target, ACTIVE_SYMBOL)?.value === true;
  const nextActive = !isActive;

  if (nextActive) {
    Object.defineProperty(target, ACTIVE_SYMBOL, {
      configurable: true,
      value: true,
    });
  } else {
    Reflect.deleteProperty(target, ACTIVE_SYMBOL);
  }

  onToggle(nextActive);
  return nextActive;
}

if (typeof window !== "undefined") {
  toggleContentSession(globalThis, (active) => {
    window.dispatchEvent(new CustomEvent("applyassist:toggle", { detail: { active } }));
  });
}
