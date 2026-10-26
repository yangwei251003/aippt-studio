import { CommercialProvider } from "../../../components/commercial/commercial-provider";
import { AccountPage } from "../../../components/commercial/commercial-pages";
// billing displays the current Pro or Free subscription.
export default function Page() { return <CommercialProvider><AccountPage tab="billing"/></CommercialProvider>; }
