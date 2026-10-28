import { mountOverlay, type OverlayController, type OverlayMessageSender } from "./overlay";

const ACTIVE_SYMBOL = Symbol.for("applyassist.active");
const OVERLAY_CONTROLLER_SYMBOL = Symbol.for("applyassist.overlay-controller");

declare const chrome:
  | {
      runtime: {
        sendMessage: OverlayMessageSender;
      };
    }
  | undefined;

function isOverlayController(value: unknown): value is OverlayController {
  return (
    typeof value === "object" &&
    value !== null &&
    "dispose" in value &&
    typeof value.dispose === "function"
  );
}

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
    if (typeof chrome === "undefined") {
      return;
    }

    if (active) {
      const controller: OverlayController = mountOverlay(
        document,
        (message) => chrome.runtime.sendMessage(message),
        () => {
          Reflect.deleteProperty(globalThis, ACTIVE_SYMBOL);
          Reflect.deleteProperty(globalThis, OVERLAY_CONTROLLER_SYMBOL);
        },
      );
      Object.defineProperty(globalThis, OVERLAY_CONTROLLER_SYMBOL, {
        configurable: true,
        value: controller,
      });
      void controller.refresh();
      return;
    }

    const storedController: unknown = Object.getOwnPropertyDescriptor(
      globalThis,
      OVERLAY_CONTROLLER_SYMBOL,
    )?.value;
    if (isOverlayController(storedController)) {
      storedController.dispose();
    }
    Reflect.deleteProperty(globalThis, OVERLAY_CONTROLLER_SYMBOL);
  });
}
