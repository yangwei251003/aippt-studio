import { CommercialProvider } from "../../../components/commercial/commercial-provider";
import { CheckoutSuccessPage } from "../../../components/commercial/commercial-pages";
// returnTo and resumeAction preserve the original project operation after checkout.
export default async function Page({ searchParams }: { searchParams: Promise<{ checkoutId?: string; returnTo?: string; resumeAction?: string }> }) { const { checkoutId, returnTo, resumeAction } = await searchParams; return <CommercialProvider><CheckoutSuccessPage checkoutId={checkoutId} returnTo={returnTo} resumeAction={resumeAction}/></CommercialProvider>; }
