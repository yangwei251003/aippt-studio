import type { Metadata } from "next";
import CreatorCenter from "../../components/account/creator-center";
import { CommercialProvider } from "../../components/commercial/commercial-provider";

export const metadata: Metadata = {
  title: "创作者中心 · AIPPT",
  description: "统一查看 AIPPT 项目、资源、权益和站内消息。",
};

export default function Page() {
  return <CommercialProvider><CreatorCenter/></CommercialProvider>;
}
