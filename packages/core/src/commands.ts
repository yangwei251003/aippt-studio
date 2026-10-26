import { z } from "zod";
import {
  cloneDocument,
  presentationElementSchema,
  presentationThemeSchema,
  presentationDocumentSchema,
  slideSchema,
  type PresentationDocument,
  type PresentationElement,
  type Slide,
} from "./document.js";

const elementPatchSchema = z.record(z.string(), z.unknown());
const slidePatchSchema = z.object({
  title: z.string().max(300).optional(),
  background: z.string().min(1).max(64).optional(),
  notes: z.string().optional(),
});
const themePatchSchema = z.object({
  name: z.string().min(1).optional(),
  headingFont: z.string().min(1).optional(),
  bodyFont: z.string().min(1).optional(),
  colors: z.object({
    background: z.string().min(1).optional(),
    foreground: z.string().min(1).optional(),
    primary: z.string().min(1).optional(),
    accent: z.string().min(1).optional(),
    muted: z.string().min(1).optional(),
  }).optional(),
});

export const presentationCommandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("element.add"), slideId: z.string().min(1), element: presentationElementSchema, index: z.number().int().nonnegative().optional() }),
  z.object({ type: z.literal("element.update"), slideId: z.string().min(1), elementId: z.string().min(1), patch: elementPatchSchema }),
  z.object({ type: z.literal("element.remove"), slideId: z.string().min(1), elementId: z.string().min(1) }),
  z.object({ type: z.literal("slide.add"), slide: slideSchema, index: z.number().int().nonnegative().optional() }),
  z.object({ type: z.literal("slide.update"), slideId: z.string().min(1), patch: slidePatchSchema }),
  z.object({ type: z.literal("slide.remove"), slideId: z.string().min(1) }),
  z.object({ type: z.literal("slide.move"), slideId: z.string().min(1), toIndex: z.number().int().nonnegative() }),
  z.object({ type: z.literal("presentation.update"), patch: z.object({ title: z.string().min(1).max(300).optional(), theme: themePatchSchema.optional() }) }),
]);

export const commandEnvelopeSchema = z.object({
  id: z.string().min(1),
  baseRevision: z.number().int().nonnegative(),
  actorId: z.string().min(1).optional(),
  createdAt: z.string().datetime().optional(),
  command: presentationCommandSchema,
});

export type PresentationCommand = z.infer<typeof presentationCommandSchema>;
export type CommandEnvelope = z.infer<typeof commandEnvelopeSchema>;

export class RevisionConflictError extends Error {
  readonly code = "REVISION_CONFLICT";
  readonly statusCode = 409;

  constructor(readonly expectedRevision: number, readonly actualRevision: number) {
    super(`Revision conflict: expected ${expectedRevision}, current revision is ${actualRevision}`);
    this.name = "RevisionConflictError";
  }
}

export class CommandRejectedError extends Error {
  readonly code = "COMMAND_REJECTED";
  readonly statusCode: number = 422;

  constructor(message: string) {
    super(message);
    this.name = "CommandRejectedError";
  }
}

export class ScopeViolationError extends CommandRejectedError {
  readonly statusCode = 422;

  constructor(readonly scopeSlideId: string) {
    super(`Every AI command must target current slide ${scopeSlideId}`);
    this.name = "ScopeViolationError";
  }
}

export interface CommandApplication {
  document: PresentationDocument;
  inverse: CommandEnvelope;
}

function findSlide(document: PresentationDocument, slideId: string): Slide {
  const slide = document.slides.find((candidate) => candidate.id === slideId);
  if (!slide) throw new CommandRejectedError(`Slide ${slideId} was not found`);
  return slide;
}

function findElement(slide: Slide, elementId: string): { element: PresentationElement; index: number } {
  const index = slide.elements.findIndex((candidate) => candidate.id === elementId);
  const element = slide.elements[index];
  if (!element || index < 0) throw new CommandRejectedError(`Element ${elementId} was not found`);
  return { element, index };
}

function commandSlideId(command: PresentationCommand): string | undefined {
  if ("slideId" in command) return command.slideId;
  if (command.type === "slide.add") return command.slide.id;
  return undefined;
}

export function assertCommandsInSlideScope(envelopes: readonly CommandEnvelope[], scopeSlideId: string): void {
  const valid = envelopes.every(({ command }) => {
    const target = commandSlideId(command);
    return target === scopeSlideId && !["slide.add", "slide.remove", "slide.move", "presentation.update"].includes(command.type);
  });
  if (!valid) throw new ScopeViolationError(scopeSlideId);
}

export function applyCommand(document: PresentationDocument, input: CommandEnvelope): CommandApplication {
  const envelope = commandEnvelopeSchema.parse(input);
  if (envelope.baseRevision !== document.revision) {
    throw new RevisionConflictError(envelope.baseRevision, document.revision);
  }

  const next = cloneDocument(document);
  const command = envelope.command;
  let inverseCommand: PresentationCommand;

  switch (command.type) {
    case "element.add": {
      const slide = findSlide(next, command.slideId);
      if (slide.elements.some(({ id }) => id === command.element.id)) throw new CommandRejectedError(`Element ${command.element.id} already exists`);
      const index = Math.min(command.index ?? slide.elements.length, slide.elements.length);
      slide.elements.splice(index, 0, command.element);
      inverseCommand = { type: "element.remove", slideId: command.slideId, elementId: command.element.id };
      break;
    }
    case "element.update": {
      const slide = findSlide(next, command.slideId);
      const { element, index } = findElement(slide, command.elementId);
      const previous: Record<string, unknown> = {};
      for (const key of Object.keys(command.patch)) previous[key] = element[key as keyof PresentationElement];
      const candidate = presentationElementSchema.parse({ ...element, ...command.patch, id: element.id, type: element.type });
      slide.elements[index] = candidate;
      inverseCommand = { type: "element.update", slideId: command.slideId, elementId: command.elementId, patch: previous };
      break;
    }
    case "element.remove": {
      const slide = findSlide(next, command.slideId);
      const { element, index } = findElement(slide, command.elementId);
      slide.elements.splice(index, 1);
      inverseCommand = { type: "element.add", slideId: command.slideId, element, index };
      break;
    }
    case "slide.add": {
      if (next.slides.some(({ id }) => id === command.slide.id)) throw new CommandRejectedError(`Slide ${command.slide.id} already exists`);
      const index = Math.min(command.index ?? next.slides.length, next.slides.length);
      next.slides.splice(index, 0, command.slide);
      inverseCommand = { type: "slide.remove", slideId: command.slide.id };
      break;
    }
    case "slide.update": {
      const slide = findSlide(next, command.slideId);
      const previous: Record<string, string> = {};
      for (const key of Object.keys(command.patch) as Array<keyof typeof command.patch>) {
        const value = slide[key];
        if (typeof value === "string") previous[key] = value;
      }
      Object.assign(slide, command.patch);
      inverseCommand = { type: "slide.update", slideId: command.slideId, patch: previous };
      break;
    }
    case "slide.remove": {
      if (next.slides.length === 1) throw new CommandRejectedError("A presentation must keep at least one slide");
      const index = next.slides.findIndex(({ id }) => id === command.slideId);
      const slide = next.slides[index];
      if (!slide || index < 0) throw new CommandRejectedError(`Slide ${command.slideId} was not found`);
      next.slides.splice(index, 1);
      inverseCommand = { type: "slide.add", slide, index };
      break;
    }
    case "slide.move": {
      const fromIndex = next.slides.findIndex(({ id }) => id === command.slideId);
      const slide = next.slides[fromIndex];
      if (!slide || fromIndex < 0) throw new CommandRejectedError(`Slide ${command.slideId} was not found`);
      next.slides.splice(fromIndex, 1);
      next.slides.splice(Math.min(command.toIndex, next.slides.length), 0, slide);
      inverseCommand = { type: "slide.move", slideId: command.slideId, toIndex: fromIndex };
      break;
    }
    case "presentation.update": {
      const previous: Record<string, unknown> = {};
      if (command.patch.title !== undefined) previous.title = next.title;
      if (command.patch.theme !== undefined) previous.theme = next.theme;
      const parsed = presentationDocumentUpdate(command.patch, next);
      next.title = parsed.title;
      next.theme = parsed.theme;
      inverseCommand = { type: "presentation.update", patch: previous };
      break;
    }
  }

  next.revision += 1;
  next.updatedAt = new Date().toISOString();
  return {
    document: presentationDocumentSchema.parse(next),
    inverse: {
      id: `${envelope.id}:inverse`,
      baseRevision: next.revision,
      actorId: envelope.actorId,
      createdAt: next.updatedAt,
      command: inverseCommand,
    },
  };
}

function presentationDocumentUpdate(patch: Extract<PresentationCommand, { type: "presentation.update" }>["patch"], current: PresentationDocument) {
  const candidateTheme = patch.theme ? { ...current.theme, ...patch.theme, colors: { ...current.theme.colors, ...patch.theme.colors } } : current.theme;
  return {
    title: z.string().min(1).max(300).parse(patch.title ?? current.title),
    theme: presentationThemeSchema.parse(candidateTheme),
  };
}

export interface CommandBatchApplication {
  document: PresentationDocument;
  inverses: CommandEnvelope[];
}

export function applyCommandBatch(document: PresentationDocument, inputs: readonly CommandEnvelope[], scopeSlideId?: string): CommandBatchApplication {
  const envelopes = inputs.map((input) => commandEnvelopeSchema.parse(input));
  if (scopeSlideId) assertCommandsInSlideScope(envelopes, scopeSlideId);
  let current = document;
  const inverses: CommandEnvelope[] = [];
  for (const envelope of envelopes) {
    const applied = applyCommand(current, envelope);
    current = applied.document;
    inverses.unshift(applied.inverse);
  }
  return { document: current, inverses };
}
