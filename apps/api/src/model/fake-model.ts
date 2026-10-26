import { commandEnvelopeSchema, createPresentationBlueprint, createPresentationDocument, type Blueprint, type CreationBrief, type PresentationDocument, type PresentationGenerationMode, type PresentationModelAdapter } from "@aippt/core";

export class FakePresentationModel implements PresentationModelAdapter {
  readonly name = "fake";

  async generateQuestions(brief: CreationBrief): Promise<string[]> {
    const questions: string[] = [];
    if (!brief.goal) questions.push("这份演示最重要的目标是什么？");
    if (!brief.audience.length) questions.push("主要听众是谁？");
    if (!brief.desiredAction) questions.push("希望听众看完后采取什么行动？");
    return questions.slice(0, 3);
  }

  async generateBlueprint(brief: CreationBrief): Promise<Blueprint> { return createPresentationBlueprint(brief); }

  async generatePresentation(input: { projectId: string; presentationId: string; brief: CreationBrief; blueprint: Blueprint; mode?: PresentationGenerationMode }): Promise<PresentationDocument> {
    return createPresentationDocument(input);
  }

  async editCurrentSlide(input: { document: PresentationDocument; slideId: string; instruction: string }): Promise<unknown[]> {
    const slide = input.document.slides.find(({ id }) => id === input.slideId);
    if (!slide) throw new Error(`Slide ${input.slideId} was not found`);
    const element = [...slide.elements].reverse().find((candidate) => candidate.type === "text");
    if (!element) return [];
    return [commandEnvelopeSchema.parse({
      id: `fake-ai-${Date.now()}`,
      baseRevision: input.document.revision,
      actorId: "ai",
      command: { type: "element.update", slideId: input.slideId, elementId: element.id, patch: { text: input.instruction } },
    })];
  }
}
