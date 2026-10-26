import type { Blueprint, CreationBrief, PresentationDocument, PresentationGenerationMode, PresentationModelAdapter } from "@aippt/core";
import { FakePresentationModel } from "./fake-model.js";
import { OpenAICompatibleTransport } from "./openai-compatible.js";
import { OpenAIResponsesTransport } from "./openai-responses.js";
import { StructuredPresentationModel } from "./structured-model.js";

export * from "./fake-model.js";
export * from "./openai-compatible.js";
export * from "./openai-responses.js";
export * from "./structured-model.js";

export class ModelConfigurationError extends Error {
  readonly statusCode = 503;
  readonly code = "AI_MODEL_NOT_CONFIGURED";
  constructor(message = "AI 生成服务未配置。请在 .env 中设置 AI_PROVIDER 与对应的模型密钥。") {
    super(message);
    this.name = "ModelConfigurationError";
  }
}

class UnconfiguredPresentationModel implements PresentationModelAdapter {
  readonly name = "unconfigured";
  private unavailable<T>(): Promise<T> { return Promise.reject(new ModelConfigurationError()); }
  generateQuestions(_brief: CreationBrief): Promise<string[]> { return this.unavailable(); }
  generateBlueprint(_brief: CreationBrief): Promise<Blueprint> { return this.unavailable(); }
  generatePresentation(_input: { projectId: string; presentationId: string; brief: CreationBrief; blueprint: Blueprint; mode?: PresentationGenerationMode }): Promise<PresentationDocument> { return this.unavailable(); }
  editCurrentSlide(_input: { document: PresentationDocument; slideId: string; instruction: string }): Promise<unknown[]> { return this.unavailable(); }
}

class FallbackPresentationModel implements PresentationModelAdapter {
  readonly name: string;
  constructor(private readonly primary: PresentationModelAdapter, private readonly fallback: PresentationModelAdapter) { this.name = `${primary.name}+fallback:${fallback.name}`; }
  private async run<T>(primary: () => Promise<T>, fallback: () => Promise<T>): Promise<T> { try { return await primary(); } catch { return fallback(); } }
  generateQuestions(brief: CreationBrief): Promise<string[]> { return this.run(() => this.primary.generateQuestions(brief), () => this.fallback.generateQuestions(brief)); }
  generateBlueprint(brief: CreationBrief): Promise<Blueprint> { return this.run(() => this.primary.generateBlueprint(brief), () => this.fallback.generateBlueprint(brief)); }
  generatePresentation(input: { projectId: string; presentationId: string; brief: CreationBrief; blueprint: Blueprint; mode?: PresentationGenerationMode }): Promise<PresentationDocument> { return this.run(() => this.primary.generatePresentation(input), () => this.fallback.generatePresentation(input)); }
  editCurrentSlide(input: { document: PresentationDocument; slideId: string; instruction: string }): Promise<unknown[]> { return this.run(() => this.primary.editCurrentSlide(input), () => this.fallback.editCurrentSlide(input)); }
  generateStructured<T>(input: { system: string; prompt: string; schemaName: string; jsonSchema: Record<string, unknown>; parse: (value: unknown) => T; images?: Array<{ dataUrl: string; detail?: "low" | "high" | "auto" }>; webSearch?: boolean }): Promise<T> {
    const invoke = (model: PresentationModelAdapter) => { const capable = model as PresentationModelAdapter & { generateStructured?: <U>(request: typeof input) => Promise<U> }; return capable.generateStructured ? capable.generateStructured<T>(input) : Promise.reject(new Error(`${model.name} does not support structured output`)); };
    return this.run(() => invoke(this.primary), () => invoke(this.fallback));
  }
}

function createProvider(provider: string, env: NodeJS.ProcessEnv): PresentationModelAdapter {
  switch (provider) {
    case "openai":
    case "openai-responses": {
      if (!env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is required for the OpenAI Responses adapter");
      return new StructuredPresentationModel(new OpenAIResponsesTransport({ apiKey: env.OPENAI_API_KEY, model: env.OPENAI_MODEL ?? "gpt-5.6-terra" }));
    }
    case "openai-compatible": {
      if (!env.OPENAI_COMPATIBLE_API_KEY || !env.OPENAI_COMPATIBLE_BASE_URL || !env.OPENAI_COMPATIBLE_MODEL) throw new Error("OPENAI_COMPATIBLE_API_KEY, OPENAI_COMPATIBLE_BASE_URL, and OPENAI_COMPATIBLE_MODEL are required");
      return new StructuredPresentationModel(new OpenAICompatibleTransport({ apiKey: env.OPENAI_COMPATIBLE_API_KEY, baseUrl: env.OPENAI_COMPATIBLE_BASE_URL, model: env.OPENAI_COMPATIBLE_MODEL }));
    }
    case "fake": {
      if (env.NODE_ENV !== "test") throw new Error("AI_PROVIDER=fake is restricted to NODE_ENV=test. Configure openai or openai-compatible for real generation.");
      return new FakePresentationModel();
    }
    default: throw new Error(`Unknown AI_PROVIDER: ${provider}`);
  }
}

export function createModelAdapter(env: NodeJS.ProcessEnv = process.env): PresentationModelAdapter {
  const provider = env.AI_PROVIDER ?? (env.NODE_ENV === "test" ? "fake" : "");
  if (!provider) return new UnconfiguredPresentationModel();
  let primary: PresentationModelAdapter;
  try { primary = createProvider(provider, env); }
  catch (error) {
    if (provider === "fake") throw error;
    return new UnconfiguredPresentationModel();
  }
  const fallbackName = env.AI_FALLBACK_PROVIDER;
  return fallbackName && fallbackName !== provider ? new FallbackPresentationModel(primary, createProvider(fallbackName, env)) : primary;
}
