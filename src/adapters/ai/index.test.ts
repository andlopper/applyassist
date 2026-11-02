import { describe, expect, it } from "vitest";
import { OllamaProvider, OpenRouterProvider } from "./index";

describe("OpenRouterProvider", () => {
  it("lists models from the OpenRouter API", async () => {
    const fetchMock = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        data: [
          { id: "openai/gpt-4o-mini:free" },
          { id: "anthropic/claude-3.5-sonnet" },
        ],
      }),
    });

    const provider = new OpenRouterProvider({ apiKey: "secret-key", fetchFn: fetchMock as unknown as typeof fetch });

    await expect(provider.listModels()).resolves.toEqual([
      { id: "openai/gpt-4o-mini:free", label: "gpt-4o-mini:free" },
      { id: "anthropic/claude-3.5-sonnet", label: "claude-3.5-sonnet" },
    ]);
  });

  it("calls the native fetch implementation with the global receiver", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = function (
      this: unknown,
      input: RequestInfo | URL,
      init?: RequestInit,
    ): Promise<Response> {
      expect(this).toBe(globalThis);
      expect(String(input)).toBe("https://openrouter.ai/api/v1/models");
      expect(init?.method).toBe("GET");
      return Promise.resolve(
        new Response(JSON.stringify({ data: [{ id: "openai/gpt-4o-mini" }] }), { status: 200 }),
      );
    };

    try {
      await new OpenRouterProvider({ apiKey: "test-key" }).listModels();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("streams provider: data_collection deny and merges fragmented SSE chunks", async () => {
    const chunks = [
      'data: {"choices":[{"delta":{"content":"Hel"}},{"delta":{"content":"lo"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":" world"}}]}\n\n',
      'data: [DONE]\n\n',
    ];

    let callCount = 0;
    const fetchMock = async (_url: string, init?: RequestInit) => {
      callCount += 1;
      const requestBody = JSON.parse(String(init?.body ?? "{}"));
      expect(requestBody.provider).toEqual({ data_collection: "deny" });
      expect(init?.headers).toMatchObject({
        Accept: "text/event-stream",
        Authorization: "Bearer test-key",
      });

      const stream = {
        getReader() {
          let index = 0;
          return {
            async read() {
              if (index >= chunks.length) {
                return { value: undefined, done: true };
              }
              const payload = chunks[index];
              index += 1;
              return {
                value: new TextEncoder().encode(payload),
                done: false,
              };
            },
          };
        },
      };

      return {
        ok: true,
        status: 200,
        body: stream,
        text: async () => "",
      };
    };

    const provider = new OpenRouterProvider({ apiKey: "test-key", fetchFn: fetchMock as unknown as typeof fetch });
    const parts: string[] = [];

    for await (const part of provider.generate(
      {
        question: "Qual é sua experiência?",
        language: "pt",
        model: "openai/gpt-4o-mini:free",
        profileContext: "Trabalhei em produtos.",
      },
      new AbortController().signal,
    )) {
      parts.push(part);
    }

    expect(callCount).toBe(1);
    expect(parts).toEqual(["Hello", " world"]);
  });

  it("maps OpenRouter auth failures to Portuguese guidance", async () => {
    const fetchMock = async () => ({
      ok: false,
      status: 401,
      text: async () => "unauthorized",
    });

    const provider = new OpenRouterProvider({ apiKey: "expired-key", fetchFn: fetchMock as unknown as typeof fetch });

    await expect(
      (async () => {
        for await (const chunk of provider.generate(
          {
            question: "Como você se descreve?",
            language: "pt",
            model: "openai/gpt-4o-mini:free",
            profileContext: "Perfil de teste",
          },
          new AbortController().signal,
        )) {
          void chunk;
        }
      })(),
    ).rejects.toThrow("Sua sessão do OpenRouter expirou");
  });

  it("throws when the fetch implementation is missing or the API key is absent", async () => {
    const providerWithoutFetch = new OpenRouterProvider({ fetchFn: 123 as unknown as typeof fetch });
    await expect(providerWithoutFetch.listModels()).rejects.toThrow("API de rede");

    const providerWithoutKey = new OpenRouterProvider({
      fetchFn: (async () => ({ ok: true, status: 200, body: null }) as unknown) as typeof fetch,
    });
    await expect(
      (async () => {
        for await (const part of providerWithoutKey.generate(
          {
            question: "Qual é sua experiência?",
            language: "pt",
            model: "openai/gpt-4o-mini:free",
            profileContext: "Perfil de teste",
          },
          new AbortController().signal,
        )) {
          void part;
        }
      })(),
    ).rejects.toThrow("Chave do OpenRouter ausente");
  });

  it("throws on abort and invalid stream bodies", async () => {
    const provider = new OpenRouterProvider({
      apiKey: "test-key",
      fetchFn: (async () => ({ ok: true, status: 200, body: null }) as unknown) as typeof fetch,
    });
    const controller = new AbortController();
    controller.abort();

    await expect(
      (async () => {
        for await (const part of provider.generate(
          {
            question: "Qual é sua experiência?",
            language: "pt",
            model: "openai/gpt-4o-mini:free",
            profileContext: "Perfil de teste",
          },
          controller.signal,
        )) {
          void part;
        }
      })(),
    ).rejects.toThrow("aborted");

    const providerWithInvalidStream = new OpenRouterProvider({
      apiKey: "test-key",
      fetchFn: (async () => ({ ok: true, status: 200, body: { value: "not-a-stream" } }) as unknown) as typeof fetch,
    });

    await expect(
      (async () => {
        for await (const part of providerWithInvalidStream.generate(
          {
            question: "Qual é sua experiência?",
            language: "pt",
            model: "openai/gpt-4o-mini:free",
            profileContext: "Perfil de teste",
          },
          new AbortController().signal,
        )) {
          void part;
        }
      })(),
    ).rejects.toThrow("não retornou um stream válido");
  });

  it("returns an empty model list when the payload is malformed and throws when none are available", async () => {
    const provider = new OpenRouterProvider({
      apiKey: "test-key",
      fetchFn: (async () => ({ ok: true, status: 200, json: async () => ({}) }) as unknown) as typeof fetch,
    });

    await expect(provider.listModels()).resolves.toEqual([]);

    const providerWithNoModels = new OpenRouterProvider({
      apiKey: "test-key",
      fetchFn: (async () => ({ ok: true, status: 200, json: async () => ({ data: [] }) }) as unknown) as typeof fetch,
    });

    await expect(providerWithNoModels.listModels()).rejects.toThrow("Nenhum modelo disponível");
  });

  it("covers alternate OpenRouter error mappings and message-based SSE payloads", async () => {
    const provider402 = new OpenRouterProvider({
      apiKey: "test-key",
      fetchFn: (async () => ({ ok: false, status: 402, text: async () => "" }) as unknown) as typeof fetch,
    });

    await expect(provider402.listModels()).rejects.toThrow("créditos");

    const provider429 = new OpenRouterProvider({
      apiKey: "test-key",
      fetchFn: (async () => ({ ok: false, status: 429, text: async () => "" }) as unknown) as typeof fetch,
    });

    await expect(provider429.listModels()).rejects.toMatchObject({
      code: "daily-limit",
      message: expect.stringContaining("limite do plano gratuito"),
    });

    const provider500 = new OpenRouterProvider({
      apiKey: "test-key",
      fetchFn: (async () => ({ ok: false, status: 500, text: async () => "" }) as unknown) as typeof fetch,
    });

    await expect(provider500.listModels()).rejects.toThrow("não respondeu corretamente");

    const provider = new OpenRouterProvider({
      apiKey: "test-key",
      fetchFn: async (_input: string | URL | Request, init?: RequestInit) => {
        const requestBody = JSON.parse(String(init?.body ?? "{}"));
        expect(requestBody.provider).toEqual({ data_collection: "deny" });

        let readCount = 0;
        return {
          ok: true,
          status: 200,
          body: {
            getReader() {
              return {
                async read() {
                  readCount += 1;
                  if (readCount > 1) {
                    return { value: undefined, done: true };
                  }
                  return {
                    value: new TextEncoder().encode('data: {"choices":[{"message":{"content":["Hello ", { "text": "world"}]}}]}\n\n'),
                    done: false,
                  };
                },
              };
            },
          },
        } as unknown as Response;
      },
    });

    const parts: string[] = [];
    for await (const chunk of provider.generate(
      {
        question: "Qual é sua experiência?",
        language: "pt",
        model: "openai/gpt-4o-mini:free",
        profileContext: "Trabalhei em produtos.",
      },
      new AbortController().signal,
    )) {
      parts.push(chunk);
    }

    expect(parts).toEqual(["Hello world"]);
  });
});

describe("OllamaProvider", () => {
  it("lists models installed in Ollama", async () => {
    let requestedUrl = "";
    const provider = new OllamaProvider({
      fetchFn: async (input: string | URL | Request) => {
        requestedUrl = String(input);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            models: [{ name: "qwen2.5:3b" }, { name: "llama3.2:1b" }, { invalid: true }],
          }),
        } as Response;
      },
    });

    await expect(provider.listModels()).resolves.toEqual([
      { id: "qwen2.5:3b", label: "qwen2.5:3b" },
      { id: "llama3.2:1b", label: "llama3.2:1b" },
    ]);
    expect(requestedUrl).toBe("http://localhost:11434/api/tags");
  });

  it("calls the native fetch implementation with the global receiver", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = function (
      this: unknown,
      input: RequestInfo | URL,
      init?: RequestInit,
    ): Promise<Response> {
      expect(this).toBe(globalThis);
      expect(String(input)).toBe("http://localhost:11434/api/tags");
      expect(init?.method).toBe("GET");
      return Promise.resolve(
        new Response(JSON.stringify({ models: [{ name: "qwen2.5:3b" }] }), { status: 200 }),
      );
    };

    try {
      await new OllamaProvider().listModels();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("streams fragmented Ollama NDJSON with thinking disabled", async () => {
    const chunks = [
      '{"message":{"content":"Olá"},"done":false}\n{"message":{"content":" mundo"}',
      ',"done":false}\n{"message":{"content":""},"done":true}\n',
    ];
    let requestBody: Record<string, unknown> | undefined;
    const provider = new OllamaProvider({
      fetchFn: async (_input: string | URL | Request, init?: RequestInit) => {
        requestBody = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
        let index = 0;
        return {
          ok: true,
          status: 200,
          body: {
            getReader() {
              return {
                async read() {
                  if (index >= chunks.length) {
                    return { value: undefined, done: true };
                  }
                  const chunk = chunks[index];
                  index += 1;
                  return { value: new TextEncoder().encode(chunk), done: false };
                },
              };
            },
          },
        } as unknown as Response;
      },
    });
    const parts: string[] = [];

    for await (const part of provider.generate(
      {
        question: "Qual é sua experiência?",
        language: "pt",
        model: "qwen2.5:3b",
        profileContext: "Trabalhei em produtos.",
      },
      new AbortController().signal,
    )) {
      parts.push(part);
    }

    expect(requestBody).toMatchObject({
      model: "qwen2.5:3b",
      stream: true,
      think: false,
    });
    expect(parts).toEqual(["Olá", " mundo"]);
  });

  it("explains how to allow the extension when Ollama returns 403", async () => {
    const provider = new OllamaProvider({
      extensionOrigin: "chrome-extension://abcdefghijklmnop",
      fetchFn: async () => ({ ok: false, status: 403 }) as Response,
    });

    await expect(provider.listModels()).rejects.toThrow(
      "OLLAMA_ORIGINS=chrome-extension://abcdefghijklmnop",
    );
    await expect(provider.listModels()).rejects.toMatchObject({ reason: "forbidden" });
  });

  it("explains how to check the allowed origin when the browser blocks the connection", async () => {
    const provider = new OllamaProvider({
      extensionOrigin: "chrome-extension://abcdefghijklmnop",
      fetchFn: async () => {
        throw new TypeError("Failed to fetch");
      },
    });

    await expect(provider.listModels()).rejects.toMatchObject({
      reason: "network",
      message: expect.stringMatching(
        /Não foi possível acessar.*OLLAMA_ORIGINS=chrome-extension:\/\/abcdefghijklmnop/,
      ),
    });
  });

  it.each([
    { status: 500, message: "não respondeu corretamente" },
    { status: 404, message: "não respondeu como esperado" },
  ])("maps Ollama HTTP $status failures to clear guidance", async ({ status, message }) => {
    const provider = new OllamaProvider({
      fetchFn: async () => ({ ok: false, status }) as Response,
    });

    await expect(provider.listModels()).rejects.toThrow(message);
    await expect(provider.listModels()).rejects.toMatchObject({
      reason: status === 500 ? "server-response" : "http-response",
    });
  });

  it("rejects malformed Ollama stream events", async () => {
    const provider = new OllamaProvider({
      fetchFn: async () => {
        let readCount = 0;
        return {
          ok: true,
          status: 200,
          body: {
            getReader() {
              return {
                async read() {
                  readCount += 1;
                  if (readCount > 1) {
                    return { value: undefined, done: true };
                  }
                  return { value: new TextEncoder().encode("not-json\n"), done: false };
                },
              };
            },
          },
        } as unknown as Response;
      },
    });

    await expect(
      (async () => {
        for await (const chunk of provider.generate(
          {
            question: "Qual é sua experiência?",
            language: "pt",
            model: "qwen2.5:3b",
            profileContext: "Trabalhei em produtos.",
          },
          new AbortController().signal,
        )) {
          void chunk;
        }
      })(),
    ).rejects.toThrow("O Ollama retornou um evento de streaming inválido");
  });

  it("identifies an interrupted Ollama response stream without leaking request content", async () => {
    const provider = new OllamaProvider({
      fetchFn: async () => ({
        ok: true,
        status: 200,
        body: {
          getReader() {
            return {
              async read() {
                throw new TypeError("stream disconnected");
              },
            };
          },
        },
      }) as unknown as Response,
    });

    await expect(
      (async () => {
        for await (const chunk of provider.generate(
          {
            question: "Private test question",
            language: "pt",
            model: "qwen2.5:3b",
            profileContext: "",
          },
          new AbortController().signal,
        )) {
          void chunk;
        }
      })(),
    ).rejects.toMatchObject({ reason: "stream-read" });
  });
});
