import { randomUUID } from "node:crypto";
import { ResourceError } from "./types.js";

export interface SkillPackageManifestV2 {
  schemaVersion: 2;
  id: string;
  version: string;
  name: string;
  description: string;
  allowedTools: Array<"research.search" | "assets.search" | "presentation.read" | "presentation.patch">;
  execution: "declarative" | "requires-container";
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
}
export interface SkillRunEvent { id: string; runId: string; sequence: number; type: "queued" | "started" | "completed" | "failed" | "cancelled"; createdAt: string; message?: string; }
export interface SkillRun { id: string; skillId: string; skillVersion: string; userId: string; status: SkillRunEvent["type"]; input: unknown; output?: unknown; errorCode?: string; createdAt: string; updatedAt: string; }
export type DeclarativeSkillHandler = (input: unknown, context: { signal: AbortSignal; allowedTools: SkillPackageManifestV2["allowedTools"] }) => Promise<unknown>;

export interface SkillRunStore {
  putRun(run: SkillRun): Promise<void>;
  getRun(id: string): Promise<SkillRun | undefined>;
  appendEvent(event: SkillRunEvent): Promise<void>;
  listEvents(runId: string): Promise<SkillRunEvent[]>;
}

export class InMemorySkillRunStore implements SkillRunStore {
  private readonly runs = new Map<string, SkillRun>();
  private readonly events = new Map<string, SkillRunEvent[]>();
  async putRun(run: SkillRun): Promise<void> { this.runs.set(run.id, structuredClone(run)); }
  async getRun(id: string): Promise<SkillRun | undefined> { const run = this.runs.get(id); return run ? structuredClone(run) : undefined; }
  async appendEvent(event: SkillRunEvent): Promise<void> { this.events.set(event.runId, [...(this.events.get(event.runId) ?? []), structuredClone(event)]); }
  async listEvents(runId: string): Promise<SkillRunEvent[]> { return structuredClone(this.events.get(runId) ?? []); }
}

export class DeclarativeSkillRunner {
  private readonly skills = new Map<string, { manifest: SkillPackageManifestV2; handler?: DeclarativeSkillHandler }>();
  private readonly controllers = new Map<string, AbortController>();
  constructor(private readonly store: SkillRunStore) {}

  register(manifest: SkillPackageManifestV2, handler?: DeclarativeSkillHandler): void {
    if (manifest.execution === "declarative" && !handler) throw new Error(`Declarative skill ${manifest.id} requires a trusted handler`);
    this.skills.set(`${manifest.id}@${manifest.version}`, { manifest: structuredClone(manifest), ...(handler ? { handler } : {}) });
  }
  async start(input: { userId: string; skillId: string; version: string; payload: unknown }): Promise<SkillRun> {
    const registered = this.skills.get(`${input.skillId}@${input.version}`);
    if (!registered) throw new ResourceError("SKILL_NOT_INSTALLED", "Skill is not installed", 404);
    if (registered.manifest.execution === "requires-container") throw new ResourceError("SANDBOX_UNAVAILABLE", "This skill requires a configured one-shot container sandbox", 503);
    const now = new Date().toISOString();
    const run: SkillRun = { id: randomUUID(), skillId: input.skillId, skillVersion: input.version, userId: input.userId, status: "queued", input: structuredClone(input.payload), createdAt: now, updatedAt: now };
    await this.store.putRun(run); await this.event(run.id, "queued");
    const controller = new AbortController(); this.controllers.set(run.id, controller);
    void this.execute(run, registered, controller);
    return run;
  }
  async cancel(runId: string, userId: string): Promise<SkillRun> {
    const run = await this.store.getRun(runId);
    if (!run || run.userId !== userId) throw new ResourceError("SKILL_RUN_NOT_FOUND", "Skill run not found", 404);
    if (["completed", "failed", "cancelled"].includes(run.status)) return run;
    this.controllers.get(runId)?.abort();
    const next = { ...run, status: "cancelled" as const, updatedAt: new Date().toISOString() };
    await this.store.putRun(next); await this.event(runId, "cancelled");
    return next;
  }
  async events(runId: string, userId: string): Promise<SkillRunEvent[]> {
    const run = await this.store.getRun(runId);
    if (!run || run.userId !== userId) throw new ResourceError("SKILL_RUN_NOT_FOUND", "Skill run not found", 404);
    return this.store.listEvents(runId);
  }
  private async execute(run: SkillRun, registered: { manifest: SkillPackageManifestV2; handler?: DeclarativeSkillHandler }, controller: AbortController): Promise<void> {
    try {
      const started = { ...run, status: "started" as const, updatedAt: new Date().toISOString() }; await this.store.putRun(started); await this.event(run.id, "started");
      const output = await registered.handler?.(run.input, { signal: controller.signal, allowedTools: registered.manifest.allowedTools });
      if (controller.signal.aborted) return;
      await this.store.putRun({ ...started, status: "completed", output: structuredClone(output), updatedAt: new Date().toISOString() }); await this.event(run.id, "completed");
    } catch {
      if (controller.signal.aborted) return;
      const current = await this.store.getRun(run.id); if (!current) return;
      await this.store.putRun({ ...current, status: "failed", errorCode: "SKILL_EXECUTION_FAILED", updatedAt: new Date().toISOString() }); await this.event(run.id, "failed", "Skill execution failed");
    } finally { this.controllers.delete(run.id); }
  }
  private async event(runId: string, type: SkillRunEvent["type"], message?: string): Promise<void> {
    const sequence = (await this.store.listEvents(runId)).length + 1;
    await this.store.appendEvent({ id: randomUUID(), runId, sequence, type, createdAt: new Date().toISOString(), ...(message ? { message } : {}) });
  }
}
