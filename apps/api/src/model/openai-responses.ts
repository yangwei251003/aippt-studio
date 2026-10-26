import type { StructuredJsonTransport } from "./structured-model.js";

interface ResponsesPayload {
  status?: string;
  error?: { message?: string } | null;
  output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string; refusal?: string }> }>;
}

export class OpenAIResponsesTransport implements StructuredJsonTransport {
  readonly name: string;

  constructor(private readonly options: { apiKey: string; model: string; baseUrl?: string; fetch?: typeof globalThis.fetch }) { this.name = `openai:${options.model}`; }

  async generate<T>(input: { system: string; prompt: string; schemaName: string; jsonSchema: Record<string, unknown>; parse: (value: unknown) => T; images?: Array<{ dataUrl: string; detail?: "low" | "high" | "auto" }>; webSearch?: boolean }): Promise<T> {
    const fetcher = this.options.fetch ?? globalThis.fetch;
    const response = await fetcher(`${(this.options.baseUrl ?? "https://api.openai.com/v1").replace(/\/$/, "")}/responses`, {
      method: "POST",
      headers: { authorization: `Bearer ${this.options.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: this.options.model,
        input: [{ role: "system", content: input.system }, { role: "user", content: input.images?.length ? [{ type: "input_text", text: input.prompt }, ...input.images.map((image) => ({ type: "input_image", image_url: image.dataUrl, detail: image.detail ?? "auto" }))] : input.prompt }],
        text: { format: { type: "json_schema", name: input.schemaName, schema: input.jsonSchema, strict: true } },
        ...(input.webSearch ? { tools: [{ type: "web_search" }] } : {}),
      }),
    });
    const payload = await response.json() as ResponsesPayload;
    if (!response.ok || payload.status === "incomplete") throw new Error(payload.error?.message ?? `OpenAI Responses request failed (${response.status})`);
    const content = payload.output?.flatMap((item) => item.content ?? []) ?? [];
    const refusal = content.find((item) => item.type === "refusal")?.refusal;
    if (refusal) throw new Error(`Model refused request: ${refusal}`);
    const text = content.filter((item) => item.type === "output_text").map((item) => item.text ?? "").join("");
    if (!text) throw new Error("OpenAI Responses returned no output text");
    return input.parse(JSON.parse(text));
  }
}
