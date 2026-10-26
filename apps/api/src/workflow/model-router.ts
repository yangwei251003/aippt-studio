import type { AgentDefinition, ModelAssignment, ModelCapability } from "./types.js";

export interface ModelCandidate {
  id: string;
  capabilities: ModelCapability[];
  available: boolean;
  quality: number;
  cost: number;
  latency: number;
}

export interface ModelRoutingPolicy {
  qualityWeight: number;
  costWeight: number;
  latencyWeight: number;
}

export interface ModelRouteContext {
  candidates?: ModelCandidate[];
  failedModelId?: string;
}

export interface ModelRouter {
  assign(agent: AgentDefinition, context?: ModelRouteContext): ModelAssignment;
}

function configuredModel(env: NodeJS.ProcessEnv, capability: ModelCapability): string | undefined {
  if (capability === "reasoning") return env.AIPPT_REASONING_MODEL;
  if (capability === "fast") return env.AIPPT_FAST_MODEL;
  if (capability === "vision") return env.AIPPT_VISION_MODEL;
  return env.AIPPT_IMAGE_MODEL;
}

function unavailableModels(env: NodeJS.ProcessEnv): Set<string> {
  return new Set((env.AIPPT_UNAVAILABLE_MODELS ?? "").split(",").map((value) => value.trim()).filter(Boolean));
}

const defaultPolicy: ModelRoutingPolicy = { qualityWeight: .6, costWeight: .2, latencyWeight: .2 };

export class CapabilityModelRouter implements ModelRouter {
  constructor(
    private readonly env: NodeJS.ProcessEnv,
    private readonly primaryModel: string,
    private readonly policy: ModelRoutingPolicy = defaultPolicy,
  ) {}

  assign(agent: AgentDefinition, context: ModelRouteContext = {}): ModelAssignment {
    const unavailable = unavailableModels(this.env);
    if (context.failedModelId) unavailable.add(context.failedModelId);
    const configured = configuredModel(this.env, agent.capability);
    const candidates = (context.candidates ?? []).filter((candidate) => candidate.available && !unavailable.has(candidate.id) && candidate.capabilities.includes(agent.capability));
    const scored = candidates.toSorted((left, right) => this.score(right) - this.score(left))[0];
    let modelId: string;
    let reason: ModelAssignment["reason"];
    if (configured && !unavailable.has(configured)) {
      modelId = configured;
      reason = "configured";
    } else if (scored) {
      modelId = scored.id;
      reason = context.failedModelId ? "runtime-fallback" : configured ? "availability-fallback" : "policy";
    } else if (!unavailable.has(this.primaryModel)) {
      modelId = this.primaryModel;
      reason = context.failedModelId ? "runtime-fallback" : configured ? "availability-fallback" : "primary-default";
    } else {
      throw new Error(`No available model for ${agent.capability}`);
    }
    return { agentId: agent.id, capability: agent.capability, modelId, fallback: reason === "runtime-fallback" || reason === "availability-fallback", reason };
  }

  private score(candidate: ModelCandidate): number {
    return candidate.quality * this.policy.qualityWeight - candidate.cost * this.policy.costWeight - candidate.latency * this.policy.latencyWeight;
  }
}
