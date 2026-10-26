import {
  blueprintSchema,
  commandEnvelopeSchema,
  createPresentationDocument,
  type Blueprint,
  type CreationBrief,
  type PresentationDocument,
  type PresentationGenerationMode,
  type PresentationModelAdapter,
} from "@aippt/core";
import { z } from "zod";

export interface StructuredJsonTransport {
  readonly name: string;
  generate<T>(input: { system: string; prompt: string; schemaName: string; jsonSchema: Record<string, unknown>; parse: (value: unknown) => T; images?: Array<{ dataUrl: string; detail?: "low" | "high" | "auto" }>; webSearch?: boolean }): Promise<T>;
}

const questionsResultSchema = z.object({ questions: z.array(z.string().min(1)) });
const questionsJsonSchema = {
  type: "object",
  properties: { questions: { type: "array", items: { type: "string" } } },
  required: ["questions"],
  additionalProperties: false,
};

const blueprintJsonSchema = {
  type: "object",
  properties: {
    schemaVersion: { type: "string", enum: ["2.0.0"] },
    title: { type: "string" },
    taskSummary: {
      type: "object",
      properties: { goal: { type: "string" }, audience: { type: "array", items: { type: "string" } }, desiredAction: { type: "string" } },
      required: ["goal", "audience", "desiredAction"], additionalProperties: false,
    },
    coreClaim: { type: "string" },
    slides: {
      type: "array",
      items: {
        type: "object",
        properties: { order: { type: "integer" }, section: { type: "string" }, purpose: { type: "string" }, title: { type: "string" }, layoutFamily: { type: "string" }, keyPoints: { type: "array", items: { type: "string" } }, evidence: { type: "array", items: { type: "string" } }, visualIntent: { type: "string" }, notes: { type: "string" } },
        required: ["order", "section", "purpose", "title", "layoutFamily", "keyPoints", "evidence", "visualIntent", "notes"], additionalProperties: false,
      },
    },
    evidencePlan: {
      type: "array",
      items: {
        type: "object",
        properties: { claim: { type: "string" }, status: { type: "string", enum: ["available", "missing"] }, source: { type: ["string", "null"] }, handling: { type: ["string", "null"] } },
        required: ["claim", "status", "source", "handling"], additionalProperties: false,
      },
    },
    visualDirection: {
      type: "object",
      properties: { id: { type: "string" }, name: { type: "string" }, density: { type: "string" }, tone: { type: "array", items: { type: "string" } }, palette: { type: "object", properties: { background: { type: "string" }, foreground: { type: "string" }, primary: { type: "string" }, accent: { type: "string" }, muted: { type: "string" } }, required: ["background", "foreground", "primary", "accent", "muted"], additionalProperties: false } },
      required: ["id", "name", "density", "tone", "palette"], additionalProperties: false,
    },
  },
  required: ["schemaVersion", "title", "taskSummary", "coreClaim", "slides", "evidencePlan", "visualDirection"],
  additionalProperties: false,
};

const slideCopySchema = (count: number) => z.object({ slides: z.array(z.object({ title: z.string(), body: z.string() })).length(count) });
const slideCopyJsonSchema = {
  type: "object",
  properties: { slides: { type: "array", items: { type: "object", properties: { title: { type: "string" }, body: { type: "string" } }, required: ["title", "body"], additionalProperties: false } } },
  required: ["slides"], additionalProperties: false,
};

const slideEditsSchema = z.object({ commands: z.array(z.object({
  elementId: z.string(),
  patch: z.object({
    text: z.string().nullable(), fontSize: z.number().nullable(), color: z.string().nullable(),
    x: z.number().nullable(), y: z.number().nullable(), width: z.number().nullable(), height: z.number().nullable(),
  }),
})) });
const slideEditsJsonSchema = {
  type: "object",
  properties: { commands: { type: "array", items: {
    type: "object",
    properties: {
      elementId: { type: "string" },
      patch: { type: "object", properties: {
        text: { type: ["string", "null"] }, fontSize: { type: ["number", "null"] }, color: { type: ["string", "null"] },
        x: { type: ["number", "null"] }, y: { type: ["number", "null"] }, width: { type: ["number", "null"] }, height: { type: ["number", "null"] },
      }, required: ["text", "fontSize", "color", "x", "y", "width", "height"], additionalProperties: false },
    },
    required: ["elementId", "patch"], additionalProperties: false,
  } } },
  required: ["commands"], additionalProperties: false,
};

function cleanEvidence(value: unknown): Blueprint {
  const raw = value as { evidencePlan?: Array<Record<string, unknown>> };
  if (raw.evidencePlan) {
    raw.evidencePlan = raw.evidencePlan.map((item) => {
      const result = { ...item };
      if (result.source === null) delete result.source;
      if (result.handling === null) delete result.handling;
      return result;
    });
  }
  return blueprintSchema.parse(raw);
}

export class StructuredPresentationModel implements PresentationModelAdapter {
  readonly name: string;

  constructor(private readonly transport: StructuredJsonTransport) {
    this.name = transport.name;
  }

  generateStructured<T>(input: { system: string; prompt: string; schemaName: string; jsonSchema: Record<string, unknown>; parse: (value: unknown) => T; images?: Array<{ dataUrl: string; detail?: "low" | "high" | "auto" }>; webSearch?: boolean }): Promise<T> {
    return this.transport.generate(input);
  }

  async generateQuestions(brief: CreationBrief): Promise<string[]> {
    const result = await this.transport.generate({
      system: "你是演示策划助手。只询问会显著影响演示结构的缺失信息，绝不超过 3 个问题。",
      prompt: JSON.stringify(brief), schemaName: "aippt_questions", jsonSchema: questionsJsonSchema,
      parse: (value) => questionsResultSchema.parse(value),
    });
    return result.questions.slice(0, 3);
  }

  async generateBlueprint(brief: CreationBrief): Promise<Blueprint> {
    return this.transport.generate({
      system: `你是演示架构师。生成严格 ${brief.slideCount} 页蓝图，一页一个结论。layoutFamily 必须使用页面意图语义；不得编造数字，缺少依据时 evidencePlan 标记 missing。`,
      prompt: JSON.stringify(brief), schemaName: "aippt_blueprint", jsonSchema: blueprintJsonSchema, parse: cleanEvidence,
    });
  }

  async generatePresentation(input: { projectId: string; presentationId: string; brief: CreationBrief; blueprint: Blueprint; mode?: PresentationGenerationMode }): Promise<PresentationDocument> {
    const copy = await this.transport.generate({
      system: `为给定蓝图写严格 ${input.blueprint.slides.length} 页简洁演示文案。每页 body 使用 1–3 条短句，不编造数据。`,
      prompt: JSON.stringify({ brief: input.brief, blueprint: input.blueprint }), schemaName: "aippt_slide_copy", jsonSchema: slideCopyJsonSchema,
      parse: (value) => slideCopySchema(input.blueprint.slides.length).parse(value),
    });
    const enriched: Blueprint = { ...input.blueprint, slides: input.blueprint.slides.map((slide, index) => ({ ...slide, title: copy.slides[index]?.title ?? slide.title, keyPoints: [copy.slides[index]?.body ?? ""] })) };
    return createPresentationDocument({ ...input, blueprint: enriched });
  }

  async editCurrentSlide(input: { document: PresentationDocument; slideId: string; instruction: string }): Promise<unknown[]> {
    const slide = input.document.slides.find(({ id }) => id === input.slideId);
    if (!slide) throw new Error(`Slide ${input.slideId} was not found`);
    const result = await this.transport.generate({
      system: "只编辑给定当前页。返回 element.update 指令所需字段；不新增、删除、移动页面。null 表示该字段不修改。",
      prompt: JSON.stringify({ instruction: input.instruction, slide }), schemaName: "aippt_slide_edits", jsonSchema: slideEditsJsonSchema,
      parse: (value) => slideEditsSchema.parse(value),
    });
    return result.commands.map((item, index) => {
      const patch = Object.fromEntries(Object.entries(item.patch).filter(([, value]) => value !== null));
      return commandEnvelopeSchema.parse({ id: `ai-${Date.now()}-${index}`, baseRevision: input.document.revision + index, actorId: "ai", command: { type: "element.update", slideId: input.slideId, elementId: item.elementId, patch } });
    });
  }
}
