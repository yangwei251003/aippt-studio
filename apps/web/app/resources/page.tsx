import type { Metadata } from "next";
import { ResourceCenter } from "../../components/resources/resource-center";

export const metadata: Metadata = { title: "资源中心 · AIPPT", description: "可追溯的 PPT、HTML 演示、图片式模板与生成 Skill。" };
export default function Page() { return <ResourceCenter/>; }

