import { describe, expect, it } from "vitest";
import { createImageDeckWorkflow, imageDeckWorkflowSchema } from "../src/index.js";

describe("image deck workflow", () => {
  it("creates independent page tasks behind outline, direction, and sample approvals", () => {
    const workflow = createImageDeckWorkflow({ presentationId: "deck", slideIds: ["s1", "s2", "s3"] });
    expect(imageDeckWorkflowSchema.parse(workflow)).toMatchObject({ stage: "outline_review", maxAttemptsPerSlide: 3 });
    expect(workflow.slides).toHaveLength(3);
    expect(workflow.slides.every(({ status }) => status === "blocked")).toBe(true);
    expect(workflow.visualDirections).toHaveLength(3);
  });
});
