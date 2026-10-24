import { isRuntimeMessage, requiresContentTab, type RuntimeMessage } from "../shared/messages";

export interface RuntimeSender {
  id?: string;
  tab?: { id?: number };
  url?: string;
}

export type MessageListener = (message: unknown, sender: RuntimeSender) => void;

export interface RuntimePort {
  id: string;
  onMessage: {
    addListener(listener: MessageListener): void;
    removeListener?(listener: MessageListener): void;
  };
}

export type RuntimeMessageHandler = (message: RuntimeMessage, sender: RuntimeSender) => void;

export function registerMessageRouter(
  runtime: RuntimePort,
  dispatch?: RuntimeMessageHandler,
): () => void {
  const listener: MessageListener = (message, sender) => {
    if (sender.id !== runtime.id) {
      return;
    }

    if (!isRuntimeMessage(message)) {
      if (
        typeof message === "object" &&
        message !== null &&
        "type" in message &&
        typeof message.type === "string"
      ) {
        console.debug("Ignoring unknown runtime message type", message.type);
      }
      return;
    }

    if (
      requiresContentTab(message) &&
      (typeof sender.tab?.id !== "number" || !Number.isInteger(sender.tab.id))
    ) {
      return;
    }

    dispatch?.(message, sender);
  };

  runtime.onMessage.addListener(listener);
  return () => runtime.onMessage.removeListener?.(listener);
}
