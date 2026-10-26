import { CommercialProvider } from "../../components/commercial/commercial-provider";
import { PricingPage } from "../../components/commercial/commercial-pages";
// Pricing handles concrete upgrade reason and checkout returnTo/resumeAction.
export default function Page() { return <CommercialProvider><PricingPage/></CommercialProvider>; }
