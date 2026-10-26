import { randomUUID } from "node:crypto";
import type { AppStore } from "../contracts.js";
import type { ModelRouter } from "./model-router.js";
import { GENERATION_WORKFLOW_VERSION, generationRunInputSchema, type GenerationRunInput, type QualityProfile } from "@aippt/core";
import { WORKFLOW_STEPS, workflowStepArtifactSchema, workflowUsageSchema, type AgentDefinition, type AgentEventRecord, type ModelAssignment, type WorkflowArtifacts, type WorkflowRunRecord, type WorkflowStep, type WorkflowStepArtifact, type WorkflowUsage } from "./types.js";

export const AGENT_DEFINITIONS: readonly AgentDefinition[] = [
  { id: "brief-researcher", role: "Brief 与研究", step: "brief-research", capability: "reasoning", promptVersion: "2.0.0", inputSchema: "GenerationRunInput", outputSchema: "BriefResearchArtifact", allowedTools: ["evidence-search"], stopCondition: "brief and material locations are explicit" },
  { id: "evidence-curator", role: "证据台账", step: "evidence-ledger", capability: "reasoning", promptVersion: "2.0.0", inputSchema: "BriefResearchArtifact", outputSchema: "EvidenceLedgerArtifact", allowedTools: ["evidence-read", "web-search"], stopCondition: "claims are sourced or marked as assumptions" },
  { id: "story-architect", role: "故事架构", step: "story-architecture", capability: "reasoning", promptVersion: "2.0.0", inputSchema: "EvidenceLedgerArtifact", outputSchema: "StoryArchitectureArtifact", allowedTools: [], stopCondition: "one assertion per requested slide" },
  { id: "data-narrator", role: "数据叙事", step: "data-narrative", capability: "reasoning", promptVersion: "2.0.0", inputSchema: "StoryArchitectureArtifact", outputSchema: "DataNarrativeArtifact", allowedTools: [], stopCondition: "charts use structured evidence only" },
  { id: "visual-director", role: "视觉导演", step: "visual-direction", capability: "reasoning", promptVersion: "2.0.0", inputSchema: "StoryArchitectureArtifact", outputSchema: "VisualDirectionArtifact", allowedTools: ["asset-search", "image-generation"], stopCondition: "deck-wide tokens and visual language are fixed" },
  { id: "layout-router", role: "版式路由", step: "layout-routing", capability: "fast", promptVersion: "2.0.0", inputSchema: "VisualDirectionArtifact", outputSchema: "LayoutRoutingArtifact", allowedTools: ["layout-registry"], stopCondition: "each slide has an executable capacity contract" },
  { id: "slide-writer", role: "逐页文案", step: "slide-copy", capability: "fast", promptVersion: "2.0.0", inputSchema: "LayoutRoutingArtifact", outputSchema: "SlideCopyArtifact", allowedTools: [], stopCondition: "copy fits assigned slots" },
  { id: "scene-compiler", role: "Scene 编译", step: "scene-compile", capability: "fast", promptVersion: "2.0.0", inputSchema: "SlideCopyArtifact", outputSchema: "SceneCompileArtifact", allowedTools: ["layout-registry", "asset-store"], stopCondition: "editable document parses against schema" },
  { id: "render-reviewer", role: "渲染审校", step: "render-review", capability: "vision", promptVersion: "2.0.0", inputSchema: "RenderedSlide[]", outputSchema: "RenderReviewArtifact", allowedTools: ["slide-render"], stopCondition: "deterministic gates and required visual review complete" },
  { id: "bounded-repairer", role: "受限修复", step: "bounded-repair", capability: "fast", promptVersion: "2.0.0", inputSchema: "RenderReviewArtifact", outputSchema: "BoundedRepairArtifact", allowedTools: ["presentation-commands", "slide-render"], stopCondition: "quality passes or profile repair limit is reached" },
  { id: "delivery-controller", role: "交付", step: "delivery", capability: "reasoning", promptVersion: "2.0.0", inputSchema: "BoundedRepairArtifact", outputSchema: "DeliveryArtifact", allowedTools: ["artifact-store"], stopCondition: "best artifact and quality status are explicit" },
] as const;

export interface WorkflowStepExecution {
  artifact: WorkflowStepArtifact;
  usage: WorkflowUsage;
}

export interface WorkflowStepExecutor {
  execute(input: { run: WorkflowRunRecord; definition: AgentDefinition; assignment: ModelAssignment; artifacts: WorkflowArtifacts }): Promise<WorkflowStepExecution>;
}

/** Honest local executor. Production integrations replace this at the service boundary. */
export class DeterministicWorkflowStepExecutor implements WorkflowStepExecutor {
  async execute({ run, definition, assignment }: { run: WorkflowRunRecord; definition: AgentDefinition; assignment: ModelAssignment }): Promise<WorkflowStepExecution> {
    return {
      artifact: { schemaVersion: "1.0.0", step: definition.step, summary: `${definition.role} completed by the server executor`, data: { projectId: run.projectId, presentationId: run.presentationId ?? null, modelId: assignment.modelId, provenance: "deterministic-server-executor" } },
      usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
    };
  }
}

export class UnavailableWorkflowStepExecutor implements WorkflowStepExecutor {
  async execute(): Promise<WorkflowStepExecution> { throw new Error("No production workflow step executor is configured"); }
}

function safePayload(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (/secret|token|api.?key|password|authorization/i.test(key)) result[key] = "[REDACTED]";
    else if (["string", "number", "boolean"].includes(typeof item) || item === null) result[key] = item;
    else if (Array.isArray(item)) result[key] = { count: item.length };
    else result[key] = "[OBJECT]";
  }
  return result;
}

export class WorkflowConflictError extends Error { readonly statusCode = 409; readonly code = "WORKFLOW_CONFLICT"; }

export class PresentationWorkflow {
  constructor(private readonly store: AppStore, private readonly router: ModelRouter, private readonly executor: WorkflowStepExecutor = new UnavailableWorkflowStepExecutor()) {}

  private definition(step: WorkflowStep): AgentDefinition {
    const definition = AGENT_DEFINITIONS.find((item) => item.step === step);
    if (!definition) throw new Error(`No agent definition for ${step}`);
    return definition;
  }

  private async event(run: WorkflowRunRecord, type: AgentEventRecord["type"], values: Partial<Omit<AgentEventRecord, "id" | "runId" | "projectId" | "sequence" | "type" | "payload" | "createdAt">> & { payload?: unknown } = {}) {
    return this.store.appendAgentEvent({
      id: randomUUID(), runId: run.id, projectId: run.projectId, type,
      ...(values.step ? { step: values.step } : {}), ...(values.agentId ? { agentId: values.agentId } : {}), ...(values.modelId ? { modelId: values.modelId } : {}),
      payload: safePayload(values.payload), createdAt: new Date().toISOString(),
    });
  }

  private async assign(run: WorkflowRunRecord, step: WorkflowStep): Promise<ModelAssignment> {
    const definition = this.definition(step);
    const assignment = run.modelAssignments[step] ?? this.router.assign(definition);
    await this.event(run, "agent.assigned", { step, agentId: definition.id, modelId: assignment.modelId, payload: { role: definition.role, capability: assignment.capability, fallback: assignment.fallback, reason: assignment.reason, promptVersion: definition.promptVersion } });
    return assignment;
  }

  async start(input: { id?: string; projectId: string; ownerUserId: string; presentationId?: string; source?: WorkflowRunRecord["source"]; idempotencyKey?: string; workflowVersion?: WorkflowRunRecord["workflowVersion"]; qualityProfile?: QualityProfile; sourceRevision?: number; inputHash?: string; generationInput?: GenerationRunInput }): Promise<WorkflowRunRecord> {
    if (input.idempotencyKey) {
      const existing = await this.store.findWorkflowRun(input.projectId, input.idempotencyKey);
      if (existing) return existing;
    }
    const now = new Date().toISOString();
    const workflowVersion = input.workflowVersion ?? (input.source === "generation" ? GENERATION_WORKFLOW_VERSION : "1.0.0");
    const generationInput = input.generationInput ? generationRunInputSchema.parse(input.generationInput) : undefined;
    const modelAssignments = Object.fromEntries(AGENT_DEFINITIONS.map((definition) => [definition.step, { ...this.router.assign(definition), promptVersion: definition.promptVersion }])) as WorkflowRunRecord["modelAssignments"];
    const run: WorkflowRunRecord = {
      id: input.id ?? randomUUID(), projectId: input.projectId, ownerUserId: input.ownerUserId,
      ...(input.presentationId ? { presentationId: input.presentationId } : {}), source: input.source ?? "api",
      status: "running", currentStep: WORKFLOW_STEPS[0], stepIndex: 0, artifacts: {}, usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
      workflowVersion, qualityProfile: input.qualityProfile ?? "standard", sourceRevision: input.sourceRevision ?? 0, modelAssignments,
      ...(input.inputHash ? { inputHash: input.inputHash } : {}), ...(generationInput ? { generationInput } : {}),
      ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}), createdAt: now, updatedAt: now,
    };
    const created = await this.store.createWorkflowRun(run);
    if (created.id !== run.id) return created;
    await this.event(run, "run.started", { step: WORKFLOW_STEPS[0], payload: { source: run.source, presentationId: run.presentationId ?? null } });
    await this.assign(run, WORKFLOW_STEPS[0]);
    return run;
  }

  async getRun(id: string) { return this.store.getWorkflowRun(id); }

  async setBestArtifact(id: string, bestArtifactId: string): Promise<WorkflowRunRecord> {
    const updated = await this.store.updateWorkflowRun(id, { bestArtifactId });
    if (!updated) throw new Error(`Workflow run ${id} was not found`);
    return updated;
  }

  async execute(id: string): Promise<WorkflowRunRecord> {
    const run = await this.store.getWorkflowRun(id);
    if (!run) throw new Error(`Workflow run ${id} was not found`);
    if (run.status !== "running" || !run.currentStep) throw new WorkflowConflictError(`Workflow run ${id} cannot continue from ${run.status}`);
    const claimed = await this.store.updateWorkflowRun(id, { status: "executing" }, { status: "running", stepIndex: run.stepIndex });
    if (!claimed) throw new WorkflowConflictError(`Workflow run ${id} advanced concurrently`);
    const completedStep = run.currentStep;
    const definition = this.definition(completedStep);
    const agentId = definition.id;
    const assignment = claimed.modelAssignments[completedStep] ?? this.router.assign(definition);
    await this.event(claimed, "step.started", { step: completedStep, agentId, modelId: assignment.modelId, payload: { stepIndex: claimed.stepIndex } });
    if (completedStep === "bounded-repair") await this.event(claimed, "repair.started", { step: completedStep, agentId, modelId: assignment.modelId, payload: { qualityProfile: claimed.qualityProfile } });
    let execution: WorkflowStepExecution;
    try {
      const raw = await this.executor.execute({ run: claimed, definition, assignment, artifacts: claimed.artifacts });
      const artifact = workflowStepArtifactSchema.parse(raw.artifact);
      if (artifact.step !== completedStep) throw new Error(`Artifact step ${artifact.step} does not match ${completedStep}`);
      if (claimed.workflowVersion === GENERATION_WORKFLOW_VERSION && artifact.schemaVersion !== GENERATION_WORKFLOW_VERSION) throw new Error(`Workflow ${GENERATION_WORKFLOW_VERSION} requires typed V2 artifacts`);
      execution = { artifact, usage: workflowUsageSchema.parse(raw.usage) };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const failed = await this.store.updateWorkflowRun(id, { status: "failed", error: message.slice(0, 500) }, { status: "executing", stepIndex: run.stepIndex });
      if (failed) {
        await this.event(failed, "step.failed", { step: completedStep, agentId, modelId: assignment.modelId, payload: { error: message.slice(0, 500) } });
        await this.event(failed, "run.failed", { step: completedStep, agentId, modelId: assignment.modelId, payload: { error: message.slice(0, 500) } });
      }
      throw error;
    }
    const artifacts = { ...claimed.artifacts, [completedStep]: execution.artifact };
    const usage = {
      inputTokens: claimed.usage.inputTokens + execution.usage.inputTokens,
      outputTokens: claimed.usage.outputTokens + execution.usage.outputTokens,
      costUsd: claimed.usage.costUsd + execution.usage.costUsd,
    };
    const nextIndex = run.stepIndex + 1;
    if (nextIndex >= WORKFLOW_STEPS.length) {
      const completed = await this.store.updateWorkflowRun(id, { status: "completed", stepIndex: nextIndex, currentStep: undefined, artifacts, usage, completedAt: new Date().toISOString(), error: undefined }, { status: "executing", stepIndex: run.stepIndex });
      if (!completed) throw new WorkflowConflictError(`Workflow run ${id} advanced concurrently`);
      await this.event(completed, "step.completed", { step: completedStep, agentId, modelId: assignment.modelId, payload: { summary: execution.artifact.summary, inputTokens: execution.usage.inputTokens, outputTokens: execution.usage.outputTokens, costUsd: execution.usage.costUsd } });
      if (execution.artifact.summary.includes("回退")) await this.event(completed, "fallback.used", { step: completedStep, agentId, modelId: assignment.modelId, payload: { summary: execution.artifact.summary } });
      if (completedStep === "delivery" && execution.artifact.schemaVersion === GENERATION_WORKFLOW_VERSION) {
        const qualityStatus = (execution.artifact.data as { qualityStatus?: string }).qualityStatus;
        await this.event(completed, qualityStatus === "passed" ? "gate.passed" : "gate.failed", { step: completedStep, payload: { qualityStatus } });
      }
      await this.event(completed, "run.completed", { payload: { steps: WORKFLOW_STEPS.length } });
      return completed;
    }
    const nextStep = WORKFLOW_STEPS[nextIndex]!;
    const advanced = await this.store.updateWorkflowRun(id, { status: "running", stepIndex: nextIndex, currentStep: nextStep, artifacts, usage }, { status: "executing", stepIndex: run.stepIndex });
    if (!advanced) throw new WorkflowConflictError(`Workflow run ${id} advanced concurrently`);
    await this.event(advanced, "step.completed", { step: completedStep, agentId, modelId: assignment.modelId, payload: { summary: execution.artifact.summary, inputTokens: execution.usage.inputTokens, outputTokens: execution.usage.outputTokens, costUsd: execution.usage.costUsd } });
    if (execution.artifact.summary.includes("回退")) await this.event(advanced, "fallback.used", { step: completedStep, agentId, modelId: assignment.modelId, payload: { summary: execution.artifact.summary } });
    if (completedStep === "bounded-repair" && execution.artifact.schemaVersion === GENERATION_WORKFLOW_VERSION) await this.event(advanced, "repair.completed", { step: completedStep, payload: { rounds: (execution.artifact.data as { rounds?: number }).rounds ?? 0 } });
    await this.assign(advanced, nextStep);
    return advanced;
  }

  /** @deprecated Steps are completed only by the configured server executor. */
  async continue(id: string): Promise<WorkflowRunRecord> { return this.execute(id); }

  async fail(id: string, error: unknown): Promise<WorkflowRunRecord> {
    const current = await this.store.getWorkflowRun(id);
    if (!current) throw new Error(`Workflow run ${id} was not found`);
    const message = error instanceof Error ? error.message : String(error);
    if (current.status !== "running" && current.status !== "executing") throw new WorkflowConflictError(`Workflow run ${id} cannot fail from ${current.status}`);
    const failed = await this.store.updateWorkflowRun(id, { status: "failed", error: message.slice(0, 500) }, { status: current.status, stepIndex: current.stepIndex });
    if (!failed) throw new Error(`Workflow run ${id} was not found`);
    await this.event(failed, "run.failed", { ...(failed.currentStep ? { step: failed.currentStep } : {}), payload: { error: message.slice(0, 500) } });
    return failed;
  }

  async retry(id: string): Promise<WorkflowRunRecord> {
    const current = await this.store.getWorkflowRun(id);
    if (!current) throw new Error(`Workflow run ${id} was not found`);
    if (current.status !== "failed" || !current.currentStep) throw new WorkflowConflictError(`Workflow run ${id} cannot retry from ${current.status}`);
    const step = current.currentStep;
    const run = await this.store.updateWorkflowRun(id, { status: "running", error: undefined }, { status: "failed", stepIndex: current.stepIndex });
    if (!run) throw new Error(`Workflow run ${id} was not found`);
    await this.event(run, "run.retried", { step });
    await this.assign(run, step);
    return run;
  }

  async cancel(id: string): Promise<WorkflowRunRecord> {
    const current = await this.store.getWorkflowRun(id);
    if (!current) throw new Error(`Workflow run ${id} was not found`);
    if (current.status === "cancelled") return current;
    if (current.status === "completed") throw new WorkflowConflictError(`Workflow run ${id} is already completed`);
    const run = await this.store.updateWorkflowRun(id, { status: "cancelled", completedAt: new Date().toISOString() }, { status: current.status, stepIndex: current.stepIndex });
    if (!run) {
      const latest = await this.store.getWorkflowRun(id);
      if (latest?.status === "cancelled") return latest;
      throw new WorkflowConflictError(`Workflow run ${id} changed concurrently`);
    }
    await this.event(run, "run.cancelled", { ...(run.currentStep ? { step: run.currentStep } : {}) });
    return run;
  }
}
