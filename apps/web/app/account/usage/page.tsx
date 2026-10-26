import { CommercialProvider } from "../../../components/commercial/commercial-provider";
import { AccountPage } from "../../../components/commercial/commercial-pages";
// usage exposes AI 点 and account entitlement information.
export default function Page() { return <CommercialProvider><AccountPage tab="usage"/></CommercialProvider>; }
