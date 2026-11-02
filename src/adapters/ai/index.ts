import { buildPrompt } from "../../core/prompts";

export type ProviderDataCollection = "deny";

export interface GenerateRequest {
  question: string;
  maxLength?: number;
  language: "pt" | "en" | "es";
  model: string;
  profileContext: string;
  jobContext?: {
    title?: string;
    company?: string;
    selectedText?: string;
  };
}

export interface AiProvider {
  id: "openrouter" | "ollama";
  listModels(signal?: AbortSignal): Promise<{ id: string; label: string }[]>;
  generate(req: GenerateRequest, signal: AbortSignal): AsyncIterable<string>;
}

export class AiProviderError extends Error {
  constructor(
    readonly code: "daily-limit" | "unavailable",
    message: string,
    readonly reason?:
      | "network"
      | "forbidden"
      | "server-response"
      | "http-response"
      | "invalid-stream"
      | "stream-unavailable"
      | "stream-read",
  ) {
    super(message);
  }
}

export interface OpenRouterModel {
  id: string;
  label: string;
}

export interface OllamaModel {
  id: string;
  label: string;
}

interface OpenRouterProviderOptions {
  apiKey?: string;
  baseUrl?: string;
  fetchFn?: typeof fetch;
}

interface OllamaProviderOptions {
  baseUrl?: string;
  extensionOrigin?: string;
  fetchFn?: typeof fetch;
}

interface OpenRouterStreamChoice {
  delta?: {
    content?: string | Array<{ text?: string } | string>;
  };
  message?: {
    content?: string | Array<{ text?: string } | string>;
  };
}

interface OpenRouterStreamResponse {
  choices?: OpenRouterStreamChoice[];
}

const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";
const DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434";

function normalizeModelLabel(modelId: string): string {
  const lastSegment = modelId.split("/").at(-1) ?? modelId;
  return lastSegment || modelId;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toContentText(content: string | Array<{ text?: string } | string> | undefined): string {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === "string") {
          return item;
        }
        return item.text ?? "";
      })
      .join("");
  }

  return "";
}

function mapOpenRouterError(status: number): Error {
  switch (status) {
    case 401:
      return new AiProviderError(
        "unavailable",
        "Sua sessão do OpenRouter expirou. Reconecte a conta ou insira uma chave válida.",
      );
    case 402:
      return new AiProviderError(
        "unavailable",
        "O OpenRouter indicou que não há créditos suficientes para esta geração.",
      );
    case 429:
      return new AiProviderError(
        "daily-limit",
        "O limite do plano gratuito do OpenRouter foi atingido. Tente novamente mais tarde ou use outro modelo.",
      );
    default:
      if (status >= 500) {
        return new AiProviderError(
          "unavailable",
          "O OpenRouter não respondeu corretamente. Tente novamente em instantes.",
        );
      }
      return new AiProviderError(
        "unavailable",
        "O OpenRouter não respondeu como esperado. Tente novamente.",
      );
  }
}

function getOllamaOriginInstruction(extensionOrigin: string): string {
  return `Configure OLLAMA_ORIGINS=${extensionOrigin} e reinicie o Ollama.`;
}

function mapOllamaError(status: number, extensionOrigin: string): Error {
  if (status === 403) {
    return new AiProviderError(
      "unavailable",
      `O Ollama bloqueou a extensão. ${getOllamaOriginInstruction(extensionOrigin)}`,
      "forbidden",
    );
  }
  if (status >= 500) {
    return new AiProviderError(
      "unavailable",
      "O Ollama não respondeu corretamente. Verifique o serviço e tente novamente.",
      "server-response",
    );
  }
  return new AiProviderError(
    "unavailable",
    "O Ollama não respondeu como esperado. Verifique o endereço e tente novamente.",
    "http-response",
  );
}

function parseOllamaEvent(line: string): string {
  if (line.trim().length === 0) {
    return "";
  }

  let event: unknown;
  try {
    event = JSON.parse(line) as unknown;
  } catch {
    throw new AiProviderError(
      "unavailable",
      "O Ollama retornou um evento de streaming inválido.",
      "invalid-stream",
    );
  }

  if (!isRecord(event)) {
    throw new AiProviderError(
      "unavailable",
      "O Ollama retornou um evento de streaming inválido.",
      "invalid-stream",
    );
  }
  const message = event.message;
  if (!isRecord(message) || typeof message.content !== "string") {
    return "";
  }
  return message.content;
}

function parseSseEvent(rawEvent: string): string {
  const lines = rawEvent
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  let payload = "";
  for (const line of lines) {
    if (line.startsWith("data:")) {
      payload += line.slice(5).trim();
    }
  }

  if (!payload || payload === "[DONE]") {
    return "";
  }

  try {
    const event = JSON.parse(payload) as OpenRouterStreamResponse;
    const choices = Array.isArray(event.choices) ? event.choices : [];
    let aggregated = "";

    for (const choice of choices) {
      const text = toContentText(choice.delta?.content) || toContentText(choice.message?.content);
      if (text.length > 0) {
        aggregated += text;
      }
    }

    if (aggregated.length > 0) {
      return aggregated;
    }
  } catch {
    return "";
  }

  return "";
}

export class OllamaProvider implements AiProvider {
  readonly id = "ollama" as const;

  private readonly baseUrl: string;
  private readonly extensionOrigin: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: OllamaProviderOptions = {}) {
    this.baseUrl = options.baseUrl ?? DEFAULT_OLLAMA_BASE_URL;
    this.extensionOrigin = options.extensionOrigin ?? "chrome-extension://<ID da extensão>";
    this.fetchImpl = options.fetchFn ?? globalThis.fetch.bind(globalThis);
  }

  async listModels(signal?: AbortSignal): Promise<OllamaModel[]> {
    if (typeof this.fetchImpl !== "function") {
      throw new Error("A API de rede do navegador não está disponível.");
    }

    const requestSignal = signal ?? new AbortController().signal;
    const response = await this.fetchOllama(`${this.baseUrl}/api/tags`, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: requestSignal,
    });

    if (!response.ok) {
      throw mapOllamaError(response.status, this.extensionOrigin);
    }

    const payload = (await response.json()) as unknown;
    if (!isRecord(payload) || !Array.isArray(payload.models)) {
      throw new AiProviderError("unavailable", "O Ollama retornou uma lista de modelos inválida.");
    }

    return payload.models.flatMap((model) => {
      if (!isRecord(model) || typeof model.name !== "string") {
        return [];
      }
      return [{ id: model.name, label: model.name }];
    });
  }

  async *generate(req: GenerateRequest, signal: AbortSignal): AsyncGenerator<string> {
    if (signal.aborted) {
      throw new DOMException("The operation was aborted.", "AbortError");
    }
    if (typeof this.fetchImpl !== "function") {
      throw new Error("A API de rede do navegador não está disponível.");
    }

    const messageText = buildPrompt({
      question: req.question,
      maxLength: req.maxLength,
      language: req.language,
      profileContext: req.profileContext,
      jobContext: req.jobContext,
    });
    const response = await this.fetchOllama(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/x-ndjson",
      },
      body: JSON.stringify({
        model: req.model,
        stream: true,
        think: false,
        messages: [{ role: "user", content: messageText }],
      }),
      signal,
    });

    if (!response.ok) {
      throw mapOllamaError(response.status, this.extensionOrigin);
    }

    const body = response.body;
    if (!body || typeof body.getReader !== "function") {
      throw new AiProviderError(
        "unavailable",
        "O Ollama não retornou um stream válido para esta geração.",
        "stream-unavailable",
      );
    }

    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      let result: ReadableStreamReadResult<Uint8Array>;
      try {
        result = await reader.read();
      } catch {
        throw new AiProviderError(
          "unavailable",
          "A conexão com o Ollama foi interrompida durante a geração.",
          "stream-read",
        );
      }
      const { value, done } = result;
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const chunk = parseOllamaEvent(line);
        if (chunk.length > 0) {
          yield chunk;
        }
      }
    }

    buffer += decoder.decode();
    const tail = parseOllamaEvent(buffer);
    if (tail.length > 0) {
      yield tail;
    }
  }

  private async fetchOllama(input: string, init: RequestInit): Promise<Response> {
    try {
      return await this.fetchImpl(input, init);
    } catch (error) {
      if (error instanceof TypeError) {
        throw new AiProviderError(
          "unavailable",
          `Não foi possível acessar o Ollama. Confirme se está em execução e se a origem da extensão está permitida. ${getOllamaOriginInstruction(this.extensionOrigin)}`,
          "network",
        );
      }
      throw error;
    }
  }
}

export class OpenRouterProvider implements AiProvider {
  readonly id = "openrouter" as const;

  private readonly apiKey?: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: OpenRouterProviderOptions = {}) {
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
    this.fetchImpl = options.fetchFn ?? globalThis.fetch.bind(globalThis);
  }

  async listModels(signal?: AbortSignal): Promise<OpenRouterModel[]> {
    if (typeof this.fetchImpl !== "function") {
      throw new Error("A API de rede do navegador não está disponível.");
    }

    const requestSignal = signal ?? new AbortController().signal;
    const headers: Record<string, string> = {
      Accept: "application/json",
    };

    if (this.apiKey && this.apiKey.trim().length > 0) {
      headers.Authorization = `Bearer ${this.apiKey}`;
    }

    const response = await this.fetchImpl(`${this.baseUrl}/models`, {
      method: "GET",
      headers,
      signal: requestSignal,
    });

    if (!response.ok) {
      throw mapOpenRouterError(response.status);
    }

    const payload = (await response.json()) as unknown;
    if (!isRecord(payload) || !Array.isArray(payload.data)) {
      return [];
    }

    const models = payload.data
      .map((entry) => {
        if (!isRecord(entry) || typeof entry.id !== "string") {
          return undefined;
        }
        return {
          id: entry.id,
          label: normalizeModelLabel(entry.id),
        };
      })
      .filter((entry): entry is OpenRouterModel => entry !== undefined);

    if (models.length === 0) {
      throw new Error(
        "Nenhum modelo disponível com privacidade 'deny'. Escolha outro modelo ou use outra chave.",
      );
    }

    return models;
  }

  async *generate(req: GenerateRequest, signal: AbortSignal): AsyncGenerator<string> {
    if (signal.aborted) {
      throw new DOMException("The operation was aborted.", "AbortError");
    }

    if (!this.apiKey || this.apiKey.trim().length === 0) {
      throw new Error(
        "Chave do OpenRouter ausente. Conecte a conta ou adicione uma chave manualmente.",
      );
    }

    const messageText = buildPrompt({
      question: req.question,
      maxLength: req.maxLength,
      language: req.language,
      profileContext: req.profileContext,
      jobContext: req.jobContext,
    });

    const response = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: req.model,
        stream: true,
        messages: [{ role: "user", content: messageText }],
        provider: {
          data_collection: "deny" as ProviderDataCollection,
        },
      }),
      signal,
    });

    if (!response.ok) {
      throw mapOpenRouterError(response.status);
    }

    const body = response.body;
    if (!body || typeof body.getReader !== "function") {
      throw new Error("O OpenRouter não retornou um stream válido para esta geração.");
    }

    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });

      const events = buffer.split("\n\n");
      buffer = events.pop() ?? "";

      for (const event of events) {
        const chunk = parseSseEvent(event);
        if (chunk.length > 0) {
          yield chunk;
        }
      }
    }

    const tail = parseSseEvent(buffer);
    if (tail.length > 0) {
      yield tail;
    }
  }
}

export function createOpenRouterProvider(
  options: OpenRouterProviderOptions = {},
): OpenRouterProvider {
  return new OpenRouterProvider(options);
}

export function createOllamaProvider(options: OllamaProviderOptions = {}): OllamaProvider {
  return new OllamaProvider(options);
}
