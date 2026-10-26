import type { BillingCheckoutInput, BillingCheckoutSession, BillingProvider } from "./provider.js";

/** Development-only provider. Runtime refuses to construct it in production. */
export class MockBillingProvider implements BillingProvider {
  readonly name = "mock";
  readonly mode = "development" as const;

  async startCheckout(input: BillingCheckoutInput): Promise<BillingCheckoutSession> {
    return {
      provider: this.name,
      mode: this.mode,
      providerCheckoutId: `mock_${input.checkoutId}`,
      completeUrl: `/checkout/success?checkoutId=${encodeURIComponent(input.checkoutId)}`,
      cancelUrl: `/checkout/cancel?checkoutId=${encodeURIComponent(input.checkoutId)}`,
    };
  }

  async completeCheckout(providerCheckoutId: string): Promise<{ paid: boolean }> {
    return { paid: providerCheckoutId.startsWith("mock_") };
  }
}
