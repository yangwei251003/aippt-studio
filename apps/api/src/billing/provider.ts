import type { BillingInterval, ResumeAction } from "../commercial/types.js";

export class BillingProviderUnavailableError extends Error {
  readonly statusCode = 501;
  readonly code = "BILLING_PROVIDER_UNAVAILABLE";
}

export interface BillingCheckoutInput {
  checkoutId: string;
  userId: string;
  interval: BillingInterval;
  returnTo: string;
  resumeAction?: ResumeAction;
}

export interface BillingCheckoutSession {
  provider: string;
  mode: "development" | "production";
  providerCheckoutId: string;
  completeUrl: string;
  cancelUrl: string;
}

export interface BillingProvider {
  readonly name: string;
  readonly mode: "development" | "production";
  startCheckout(input: BillingCheckoutInput): Promise<BillingCheckoutSession>;
  completeCheckout(providerCheckoutId: string): Promise<{ paid: boolean }>;
}

export class UnavailableBillingProvider implements BillingProvider {
  readonly name = "unconfigured";
  readonly mode = "production" as const;
  async startCheckout(): Promise<never> { throw new BillingProviderUnavailableError("Production billing is not configured"); }
  async completeCheckout(): Promise<never> { throw new BillingProviderUnavailableError("Production billing is not configured"); }
}
