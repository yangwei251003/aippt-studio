import type { Metadata } from "next";
import { ResourceUploadPage } from "../../../components/resources/resource-upload-page";

export const metadata: Metadata = { title: "上传资源 · AIPPT" };
export default function Page() { return <ResourceUploadPage/>; }

