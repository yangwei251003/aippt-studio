export type CreatorMessageKind = "collaboration" | "resource" | "system" | "milestone";

export type CreatorMessage = {
  id: string;
  kind: CreatorMessageKind;
  title: string;
  body: string;
  actionHref: string;
  actionLabel: string;
  createdAt: string;
  readAt?: string;
};

const apiOrigin = process.env.NEXT_PUBLIC_API_ORIGIN ?? "/backend-api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiOrigin}${path}`, {
    ...init,
    cache: "no-store",
    headers: { "content-type": "application/json", ...init?.headers },
  });
  if (!response.ok) throw new Error(`消息服务暂时不可用（${response.status}）`);
  return response.json() as Promise<T>;
}

export function listCreatorMessages() {
  return request<{ messages: CreatorMessage[]; unreadCount: number }>("/api/creator/messages");
}

export function setCreatorMessageRead(messageId: string, read: boolean) {
  return request<{ message: CreatorMessage }>(`/api/creator/messages/${encodeURIComponent(messageId)}`, {
    method: "PATCH",
    body: JSON.stringify({ read }),
  });
}

export function markAllCreatorMessagesRead() {
  return request<{ messages: CreatorMessage[]; unreadCount: number }>("/api/creator/messages/read-all", { method: "POST" });
}

export async function getCreatorProjectSummary() {
  const payload = await request<{ projects: Array<{ id: string; name: string; updatedAt: string }> }>("/api/projects");
  const projects = [...payload.projects].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  return { count: projects.length, latest: projects[0] };
}
