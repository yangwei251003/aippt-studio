import { describe, expect, it } from "vitest";
import { createModelAdapter, ModelConfigurationError } from "../src/model/index.js";

describe("model configuration startup behavior", () => {
  it("keeps the API bootable without silently generating fake content", async () => {
    const model = createModelAdapter({ NODE_ENV: "development" });

    expect(model.name).toBe("unconfigured");
    await expect(model.generateQuestions({
      topic: "未配置模型的启动检查",
      goal: "验证服务状态",
      audience: ["开发者"],
      desiredAction: "配置真实模型",
      slideCount: 3,
      durationMinutes: 10,
      language: "zh-CN",
      answers: {},
      sources: [],
    })).rejects.toMatchObject<ModelConfigurationError>({
      code: "AI_MODEL_NOT_CONFIGURED",
      statusCode: 503,
    });
  });
});
