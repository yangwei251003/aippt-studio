import { redirect } from "next/navigation";
import { projectHref } from "../../../lib/project-routes";

export default async function ProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  redirect(projectHref(projectId, "brief"));
}
