export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) return Response.json({ error: "请输入当前页修改要求" }, { status: 400 });
  const slide = body?.slide;
  if (!slide?.id || !Array.isArray(slide.elements)) return Response.json({ error: "缺少当前页上下文" }, { status: 400 });
  const api = process.env.API_ORIGIN ?? "http://localhost:8787";
  try {
    const created = await fetch(`${api}/api/projects`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "当前页 AI 修改", topic: slide.title || "当前页优化" }) });
    if (!created.ok) throw new Error("AI 服务不可用");
    const project = (await created.json()).project;
    const now = new Date().toISOString();
    const document = {
      schemaVersion: "1.0.0", id: crypto.randomUUID(), projectId: project.id, title: slide.title || "当前页优化", aspectRatio: "16:9", revision: 0, createdAt: now, updatedAt: now, sources: [],
      theme: { name: "AIPPT Sage", headingFont: "Aptos Display", bodyFont: "Aptos", colors: { background: "#F6F5EF", foreground: "#17231F", primary: "#426B57", accent: "#F28B50", muted: "#D7E4DC" } },
      slides: [{ id: slide.id, title: slide.title || "", background: "#FFFFFF", notes: "", elements: slide.elements.map((element: any) => {
        const base = { id: element.id, x: element.x / 96, y: element.y / 96, width: element.w / 96, height: element.h / 96, rotation: 0, opacity: 1, locked: false };
        if (element.kind === "text") return { ...base, type: "text", text: element.value || "", fontFamily: "Aptos", fontSize: element.size || 20, color: element.color || "#17231F", bold: true, italic: false, align: "left", verticalAlign: "top" };
        if (element.kind === "image") return { ...base, type: "image", src: `${new URL(request.url).origin}/generated/production/pazhou-pazhou-master/pazhou-pazhou-master.webp`, alt: "广州琶洲", fit: "cover" };
        return { ...base, type: "shape", shape: element.radius ? "roundRect" : "rect", fill: element.color || "#176bff", stroke: element.color || "#176bff", strokeWidth: 0 };
      }) }],
    };
    const saved = await fetch(`${api}/api/projects/${project.id}/presentations`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ document }) });
    if (!saved.ok) throw new Error("当前页上下文保存失败");
    const edited = await fetch(`${api}/api/presentations/${document.id}/ai-edit`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ slideId: slide.id, instruction: prompt, baseRevision: 0 }) });
    if (!edited.ok) throw new Error("AI 当前页修改失败");
    const result = await edited.json();
    const text = result.commands?.map((command: any) => command?.command?.patch?.text).find((value: unknown) => typeof value === "string");
    return Response.json({ provider: "api", text: text ?? prompt, scope: { slideId: slide.id } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "AI 服务不可用", configuration: "请确认 API 已启动并已配置 AI_PROVIDER" }, { status: 503 });
  }
}
