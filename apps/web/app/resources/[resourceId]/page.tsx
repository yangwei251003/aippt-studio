import type { Metadata } from "next";
import { ResourceDetailPage } from "../../../components/resources/resource-detail-page";

export const metadata: Metadata = { title: "资源详情 · AIPPT" };
export default async function Page({ params }: { params: Promise<{ resourceId: string }> }) { const { resourceId } = await params; return <ResourceDetailPage resourceId={resourceId}/>; }
