import { z } from "zod";

export const imageDeckWorkflowSchema = z.object({
  schemaVersion: z.literal("1.0.0"), presentationId: z.string().min(1),
  stage: z.enum(["outline_review", "direction_review", "sample_review", "generating", "qa", "completed", "failed"]),
  visualDirections: z.array(z.object({ id: z.string(), name: z.string(), prompt: z.string(), palette: z.array(z.string()) })).length(3),
  selectedDirectionId: z.string().optional(), sampleAssetId: z.string().optional(), maxAttemptsPerSlide: z.literal(3),
  slides: z.array(z.object({ slideId: z.string(), status: z.enum(["blocked", "pending", "generating", "qa", "completed", "failed"]), attempts: z.number().int().min(0).max(3), prompt: z.string(), assetId: z.string().optional(), qa: z.object({ ocr: z.enum(["pending", "pass", "fail"]), textAccuracy: z.enum(["pending", "pass", "fail"]), styleConsistency: z.enum(["pending", "pass", "fail"]), crop: z.enum(["pending", "pass", "fail"]), source: z.enum(["pending", "pass", "fail"]) }) })),
  createdAt: z.string().datetime(), updatedAt: z.string().datetime(),
});

export type ImageDeckWorkflow = z.infer<typeof imageDeckWorkflowSchema>;

export function createImageDeckWorkflow(input: { presentationId: string; slideIds: string[]; now?: string }): ImageDeckWorkflow {
  const now = input.now ?? new Date().toISOString(); const pendingQa = { ocr: "pending" as const, textAccuracy: "pending" as const, styleConsistency: "pending" as const, crop: "pending" as const, source: "pending" as const };
  return imageDeckWorkflowSchema.parse({ schemaVersion: "1.0.0", presentationId: input.presentationId, stage: "outline_review", maxAttemptsPerSlide: 3, createdAt: now, updatedAt: now,
    visualDirections: [
      { id: "cinematic", name: "电影级叙事", prompt: "高对比、真实光影、单一视觉焦点", palette: ["#0A0A0A", "#B7F34A", "#FF725E"] },
      { id: "editorial", name: "高级编辑设计", prompt: "克制留白、摄影与排版平衡", palette: ["#F4F4EF", "#111311", "#FF725E"] },
      { id: "technical", name: "未来科技", prompt: "深色空间、精密线框、可信数据感", palette: ["#101415", "#71E5FF", "#B7F34A"] },
    ], slides: input.slideIds.map((slideId) => ({ slideId, status: "blocked", attempts: 0, prompt: "", qa: pendingQa })) });
}

export function advanceImageDeckWorkflow(workflowInput: ImageDeckWorkflow, action: { type: "approve-outline" } | { type: "select-direction"; directionId: string } | { type: "approve-sample"; assetId: string }): ImageDeckWorkflow {
  const workflow = imageDeckWorkflowSchema.parse(workflowInput); const updatedAt = new Date().toISOString();
  if (action.type === "approve-outline" && workflow.stage === "outline_review") return imageDeckWorkflowSchema.parse({ ...workflow, stage: "direction_review", updatedAt });
  if (action.type === "select-direction" && workflow.stage === "direction_review" && workflow.visualDirections.some(({ id }) => id === action.directionId)) return imageDeckWorkflowSchema.parse({ ...workflow, stage: "sample_review", selectedDirectionId: action.directionId, updatedAt });
  if (action.type === "approve-sample" && workflow.stage === "sample_review" && workflow.selectedDirectionId) return imageDeckWorkflowSchema.parse({ ...workflow, stage: "generating", sampleAssetId: action.assetId, slides: workflow.slides.map((slide) => ({ ...slide, status: "pending" })), updatedAt });
  throw new Error(`Image-deck action ${action.type} is invalid during ${workflow.stage}`);
}
