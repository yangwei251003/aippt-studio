import type { StructuredJsonTransport } from "./structured-model.js";

interface ChatPayload {
  error?: { message?: string };
  choices?: Array<{ message?: { content?: string } }>;
}

export class OpenAICompatibleTransport implements StructuredJsonTransport {
  readonly name: string;

  constructor(private readonly options: { apiKey: string; model: string; baseUrl: string; fetch?: typeof globalThis.fetch }) { this.name = `openai-compatible:${options.model}`; }

  async generate<T>(input: { system: string; prompt: string; schemaName: string; jsonSchema: Record<string, unknown>; parse: (value: unknown) => T }): Promise<T> {
    const fetcher = this.options.fetch ?? globalThis.fetch;
    const schemaInstruction = `${input.system}\n只输出符合以下 JSON Schema 的 JSON：${JSON.stringify(input.jsonSchema)}`;
    const request = async (messages: Array<{ role: string; content: string }>) => {
      const response = await fetcher(`${this.options.baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: { authorization: `Bearer ${this.options.apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({ model: this.options.model, messages, response_format: { type: "json_object" } }),
      });
      const payload = await response.json() as ChatPayload;
      if (!response.ok) throw new Error(payload.error?.message ?? `OpenAI-compatible request failed (${response.status})`);
      const text = payload.choices?.[0]?.message?.content;
      if (!text) throw new Error("OpenAI-compatible endpoint returned no message content");
      return text;
    };
    const messages = [{ role: "system", content: schemaInstruction }, { role: "user", content: input.prompt }];
    const first = await request(messages);
    try { return input.parse(JSON.parse(first)); }
    catch {
      const repaired = await request([...messages, { role: "assistant", content: first }, { role: "user", content: "上一个 JSON 无法通过校验。只修复 JSON 结构与字段，不新增事实；仅输出修复后的 JSON。" }]);
      return input.parse(JSON.parse(repaired));
    }
  }
}
