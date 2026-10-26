import { describe, expect, it } from "vitest";
import { CapabilityModelRouter } from "../src/workflow/model-router.js";
import type { AgentDefinition } from "../src/workflow/types.js";

const agent: AgentDefinition = { id: "story", role: "story", step: "story-architecture", capability: "reasoning", promptVersion: "1", inputSchema: "input", outputSchema: "output", allowedTools: [], stopCondition: "done" };

describe("CapabilityModelRouter", () => {
  it("treats the primary model as a normal default rather than a fallback", () => {
    expect(new CapabilityModelRouter({}, "primary").assign(agent)).toMatchObject({ modelId: "primary", fallback: false, reason: "primary-default" });
  });

  it("routes by policy among available capable candidates", () => {
    const assignment = new CapabilityModelRouter({}, "primary").assign(agent, { candidates: [
      { id: "slow-best", capabilities: ["reasoning"], available: true, quality: 1, cost: .9, latency: .9 },
      { id: "balanced", capabilities: ["reasoning"], available: true, quality: .9, cost: .1, latency: .1 },
      { id: "offline", capabilities: ["reasoning"], available: false, quality: 2, cost: 0, latency: 0 },
    ] });
    expect(assignment).toMatchObject({ modelId: "balanced", fallback: false, reason: "policy" });
  });

  it("marks only availability/runtime substitutions as fallback", () => {
    const configuredUnavailable = new CapabilityModelRouter({ AIPPT_REASONING_MODEL: "offline", AIPPT_UNAVAILABLE_MODELS: "offline" }, "primary").assign(agent);
    expect(configuredUnavailable).toMatchObject({ modelId: "primary", fallback: true, reason: "availability-fallback" });
    const runtime = new CapabilityModelRouter({}, "primary").assign(agent, { failedModelId: "primary", candidates: [{ id: "backup", capabilities: ["reasoning"], available: true, quality: .7, cost: .2, latency: .2 }] });
    expect(runtime).toMatchObject({ modelId: "backup", fallback: true, reason: "runtime-fallback" });
  });
});
