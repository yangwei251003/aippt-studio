import { redirect } from "next/navigation";
import { ProjectRouteShell } from "../../../../components/project-data/project-route-shell";
import { projectHref, resolveProjectStage } from "../../../../lib/project-routes";

export default async function ProjectStagePage({ params }: { params: Promise<{ projectId: string; stage: string }> }) {
  const { projectId, stage } = await params;
  const resolvedStage = resolveProjectStage(stage);
  if (stage !== resolvedStage) redirect(projectHref(projectId, resolvedStage));
  return <ProjectRouteShell projectId={projectId} stage={resolvedStage} />;
}
