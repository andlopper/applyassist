import { describe, expect, it } from "vitest";
import { OpenRouterProvider } from "./index";

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

    await expect(provider429.listModels()).rejects.toThrow("limite do plano gratuito");

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
