import { describe, expect, it } from "vitest";
import { OpenAICompatibleTransport } from "../src/model/openai-compatible.js";
import { OpenAIResponsesTransport } from "../src/model/openai-responses.js";
import { StructuredPresentationModel } from "../src/model/structured-model.js";

const brief = { topic: "季度复盘", audience: [], answers: {}, sources: [], language: "zh-CN" };

describe("model adapters", () => {
  it("uses the Responses API structured text format and parses output_text", async () => {
    let requestUrl = "";
    let requestBody: Record<string, unknown> = {};
    const fetcher: typeof fetch = async (input, init) => {
      requestUrl = String(input);
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(JSON.stringify({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ questions: ["听众最关心什么？"] }) }] }] }), { status: 200, headers: { "content-type": "application/json" } });
    };
    const model = new StructuredPresentationModel(new OpenAIResponsesTransport({ apiKey: "test", model: "gpt-test", fetch: fetcher }));
    await expect(model.generateQuestions(brief)).resolves.toEqual(["听众最关心什么？"]);
    expect(requestUrl).toBe("https://api.openai.com/v1/responses");
    expect(requestBody).toMatchObject({ model: "gpt-test", text: { format: { type: "json_schema", name: "aippt_questions", strict: true } } });
  });

  it("uses the configured OpenAI-compatible chat completions endpoint", async () => {
    let requestUrl = "";
    const fetcher: typeof fetch = async (input) => {
      requestUrl = String(input);
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ questions: ["交付时间是什么？"] }) } }] }), { status: 200, headers: { "content-type": "application/json" } });
    };
    const model = new StructuredPresentationModel(new OpenAICompatibleTransport({ apiKey: "test", model: "compatible-model", baseUrl: "https://models.example/v1/", fetch: fetcher }));
    await expect(model.generateQuestions(brief)).resolves.toEqual(["交付时间是什么？"]);
    expect(requestUrl).toBe("https://models.example/v1/chat/completions");
  });
});
