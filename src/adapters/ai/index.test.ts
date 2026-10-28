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
        for await (const _chunk of provider.generate(
          {
            question: "Como você se descreve?",
            language: "pt",
            model: "openai/gpt-4o-mini:free",
            profileContext: "Perfil de teste",
          },
          new AbortController().signal,
        )) {
          // Exhaust the generator to trigger the HTTP error.
        }
      })(),
    ).rejects.toThrow("Sua sessão do OpenRouter expirou");
  });
});
