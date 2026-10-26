import { randomUUID } from "node:crypto";
import { COMMERCIAL_PLANS, CREDIT_COSTS } from "./config.js";
import type {
  AccountRecord,
  AnalyticsEventName,
  AnalyticsEventRecord,
  CommercialFeature,
  CommercialPlan,
  CommercialStore,
  CreditReservationRecord,
  ModelTier,
  PlanEntitlements,
  PlanId,
} from "./types.js";

export class CommercialError extends Error {
  constructor(readonly code: string, message: string, readonly statusCode = 403, readonly details: Record<string, unknown> = {}) { super(message); }
}

export interface CreditEstimateInput {
  action: "generate";
  pageCount: number;
  textModel?: ModelTier | undefined;
  imageModel?: ModelTier | undefined;
  projectId?: string | undefined;
}

export interface CreditEstimate {
  cost: number;
  balance: number;
  sufficient: boolean;
  allowed: boolean;
  blockingReason?: "insufficient_credits" | "page_limit" | "feature_not_entitled";
  requiredPlan?: "pro";
}

const featureFlags: Record<CommercialFeature, (entitlements: PlanEntitlements) => boolean> = {
  advanced_text_model: (value) => value.textModels.includes("advanced"),
  advanced_image_model: (value) => value.imageModels.includes("advanced"),
  advanced_template: (value) => value.advancedTemplates,
  unbranded_pptx: (value) => value.unbrandedPptx,
  pdf_export: (value) => value.exportFormats.includes("pdf"),
  png_export: (value) => value.exportFormats.includes("png"),
  extended_history: (value) => value.versionHistoryDays > COMMERCIAL_PLANS.free.entitlements.versionHistoryDays,
  html_export: (value) => value.exportFormats.includes("html"),
};

export class CommercialService {
  constructor(private readonly store: CommercialStore) {}

  async getAccount(userId: string): Promise<AccountRecord> { return this.store.ensureAccount(userId); }

  async getCurrentPlan(userId: string): Promise<CommercialPlan> {
    const account = await this.store.ensureAccount(userId);
    return COMMERCIAL_PLANS[account.planId];
  }

  async getEntitlements(userId: string): Promise<PlanEntitlements> {
    return (await this.getCurrentPlan(userId)).entitlements;
  }

  async canUseFeature(userId: string, feature: CommercialFeature): Promise<boolean> {
    return featureFlags[feature](await this.getEntitlements(userId));
  }

  async getCreditBalance(userId: string): Promise<number> {
    return (await this.store.ensureAccount(userId)).creditBalance;
  }

  async estimateCreditCost(userId: string, input: CreditEstimateInput): Promise<CreditEstimate> {
    const account = await this.store.ensureAccount(userId);
    const entitlements = COMMERCIAL_PLANS[account.planId].entitlements;
    const textModel = input.textModel ?? "standard";
    const imageModel = input.imageModel ?? "standard";
    const textCost = textModel === "advanced" ? CREDIT_COSTS.advancedTextPerPage : CREDIT_COSTS.standardTextPerPage;
    const imageCost = imageModel === "advanced" ? CREDIT_COSTS.advancedImagePerPage : CREDIT_COSTS.standardImagePerPage;
    const cost = input.pageCount * (textCost + imageCost);
    let blockingReason: CreditEstimate["blockingReason"];
    if (input.pageCount > entitlements.maxPagesPerPresentation) blockingReason = "page_limit";
    else if (!entitlements.textModels.some((model) => model === textModel) || !entitlements.imageModels.some((model) => model === imageModel)) blockingReason = "feature_not_entitled";
    else if (account.creditBalance < cost) blockingReason = "insufficient_credits";
    return {
      cost,
      balance: account.creditBalance,
      sufficient: account.creditBalance >= cost,
      allowed: !blockingReason,
      ...(blockingReason ? { blockingReason, requiredPlan: "pro" as const } : {}),
    };
  }

  async reserveCredits(input: CreditEstimateInput & { userId: string; projectId: string; jobId: string; idempotencyKey: string }): Promise<CreditReservationRecord> {
    const estimate = await this.estimateCreditCost(input.userId, input);
    if (!estimate.allowed) {
      if (estimate.blockingReason === "insufficient_credits") {
        try { await this.recordEvent(input.userId, "credits_exhausted", { projectId: input.projectId, metadata: { cost: estimate.cost, balance: estimate.balance } }); } catch { /* The entitlement decision remains authoritative. */ }
        throw new CommercialError("INSUFFICIENT_CREDITS", "Not enough AI credits", 402, { estimate, requiredPlan: "pro" });
      }
      throw new CommercialError("FEATURE_NOT_ENTITLED", "The selected generation options require Pro", 403, { estimate, requiredPlan: "pro" });
    }
    const reservation = await this.store.reserveCredit({
      id: randomUUID(),
      userId: input.userId,
      action: input.action,
      amount: estimate.cost,
      projectId: input.projectId,
      jobId: input.jobId,
      idempotencyKey: input.idempotencyKey,
    });
    if (!reservation) throw new CommercialError("INSUFFICIENT_CREDITS", "Not enough AI credits", 402, { requiredPlan: "pro" });
    if (reservation.status !== "reserved") throw new CommercialError("CREDIT_REQUEST_ALREADY_FINALIZED", "This credit idempotency key has already been finalized", 409, { reservationId: reservation.id, status: reservation.status });
    return reservation;
  }

  async settleCredits(reservationId: string): Promise<CreditReservationRecord> {
    const reservation = await this.store.settleCredit(reservationId);
    if (!reservation) throw new CommercialError("RESERVATION_NOT_FOUND", `Credit reservation ${reservationId} was not found`, 404);
    if (reservation.status !== "settled") throw new CommercialError("CREDIT_RESERVATION_NOT_SETTLEABLE", `Credit reservation ${reservationId} is ${reservation.status}`, 409);
    return reservation;
  }

  async refundCredits(reservationId: string): Promise<CreditReservationRecord> {
    const reservation = await this.store.refundCredit(reservationId);
    if (!reservation) throw new CommercialError("RESERVATION_NOT_FOUND", `Credit reservation ${reservationId} was not found`, 404);
    return reservation;
  }

  async assertCanCreateProject(userId: string): Promise<void> {
    const [count, entitlements] = await Promise.all([this.store.countProjectsForUser(userId), this.getEntitlements(userId)]);
    if (count >= entitlements.maxProjects) throw new CommercialError("PROJECT_LIMIT_REACHED", `This plan allows ${entitlements.maxProjects} active projects`, 403, { requiredPlan: "pro", maxProjects: entitlements.maxProjects });
  }

  async assertFeature(userId: string, feature: CommercialFeature): Promise<void> {
    if (!await this.canUseFeature(userId, feature)) throw new CommercialError("FEATURE_NOT_ENTITLED", `Feature ${feature} requires Pro`, 403, { feature, requiredPlan: "pro" });
  }

  async recordEvent(userId: string, event: AnalyticsEventName, input: { projectId?: string | undefined; presentationId?: string | undefined; metadata?: Record<string, unknown> | undefined; idempotencyKey?: string | undefined } = {}): Promise<AnalyticsEventRecord> {
    const record: AnalyticsEventRecord = {
      id: randomUUID(), userId, event,
      ...(input.projectId ? { projectId: input.projectId } : {}),
      ...(input.presentationId ? { presentationId: input.presentationId } : {}),
      metadata: input.metadata ?? {},
      ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
      createdAt: new Date().toISOString(),
    };
    return this.store.recordAnalyticsEvent(record);
  }
}

export function planForId(planId: PlanId): CommercialPlan { return COMMERCIAL_PLANS[planId]; }
