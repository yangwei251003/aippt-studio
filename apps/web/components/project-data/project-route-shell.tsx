"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  AlertTriangle, ArrowRight, Check, ChevronLeft, Download, FileText, History,
  LayoutTemplate, LoaderCircle, LocateFixed, MessageSquareShare, MonitorUp,
  MoreHorizontal, Play, Redo2, RefreshCw, RotateCcw, Send, Sparkles, Undo2,
} from "lucide-react";
import { getProjectStore } from "../../lib/project-store";
import { projectHref } from "../../lib/project-routes";
import { estimateCredits, reasonFromEstimate, takeResumeAction, track, type UpgradeReason } from "../../lib/commercial";
import { CommercialProvider, useCommercial } from "../commercial/commercial-provider";
import { CommercialStatus } from "../commercial/commercial-status";
import { UpgradeModal } from "../commercial/upgrade-modal";
import { productCopy } from "../../content/product-copy";
import type { ExportFormat, PresentationElement, PresentationProject, ProjectJob, ProjectStage, ProjectWorkbench, QualityIssue, SlideSpec } from "../../lib/project-types";
import styles from "./workbench.module.css";

const store = getProjectStore();
const apiOrigin = process.env.NEXT_PUBLIC_API_ORIGIN ?? "/backend-api";
const stageItems: Array<{ id: ProjectStage; label: string }> = [
  { id: "brief", label: "需求" }, { id: "outline", label: "蓝图" }, { id: "generate", label: "生成" },
  { id: "edit", label: "编辑" }, { id: "review", label: "检查" }, { id: "export", label: "交付" },
];

function reportIsCurrent(project: PresentationProject) {
  return project.qualityReport?.revision === project.revision && project.qualityReport.status !== "stale";
}
function reportPassed(project: PresentationProject) {
  return reportIsCurrent(project) && (project.qualityReport?.status === "success" || project.qualityReport?.status === "passed");
}
function dateLabel(value?: string) {
  return value ? new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value)) : "尚未保存";
}
function latestJob(workbench: ProjectWorkbench, type: ProjectJob["type"]) {
  return [...workbench.jobs].reverse().find((job) => job.type === type);
}

type WorkflowEvent = { id: string; type: string; step?: string; agentId?: string; modelId?: string; sequence?: number; createdAt?: string };
type WorkflowRun = { id: string; status: string; currentStep?: string; stepIndex?: number; updatedAt?: string };

function WorkflowFeed({ projectId, jobs }: { projectId: string; jobs: ProjectJob[] }) {
  const [run, setRun] = useState<WorkflowRun>();
  const [events, setEvents] = useState<WorkflowEvent[]>([]);
  const [available, setAvailable] = useState(true);
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      const candidates = [
        `${apiOrigin}/api/projects/${encodeURIComponent(projectId)}/workflow-runs/latest`,
        `${apiOrigin}/api/projects/${encodeURIComponent(projectId)}/workflow-runs`,
      ];
      let payload: { run?: WorkflowRun; events?: WorkflowEvent[] } | undefined;
      for (const url of candidates) {
        const response = await fetch(url, { cache: "no-store" }).catch(() => undefined);
        if (response?.ok) { payload = await response.json() as typeof payload; break; }
      }
      if (stopped) return;
      setAvailable(Boolean(payload?.run || payload?.events?.length));
      if (payload?.run) setRun(payload.run);
      if (payload?.events) setEvents(payload.events.slice(-8));
      if (payload?.run?.status === "running" || payload?.run?.status === "executing") timer = setTimeout(() => void load(), 2500);
    };
    void load();
    return () => { stopped = true; if (timer) clearTimeout(timer); };
  }, [projectId]);
  const fallback = [...jobs].sort((a, b) => String(a.updatedAt ?? a.startedAt).localeCompare(String(b.updatedAt ?? b.startedAt))).slice(-6);
  return <div className={styles.workflowFeed} aria-live="polite">
    <div className={styles.workflowHead}><b>任务事件</b><span>{run ? `${run.status} · ${run.currentStep ?? "等待下一步"}` : available ? "正在读取" : "兼容任务视图"}</span></div>
    {events.length ? events.map((event) => <article key={event.id}><time>{dateLabel(event.createdAt)}</time><div><b>{event.step ?? event.type}</b><small>{event.agentId ? `${event.agentId}${event.modelId ? ` · ${event.modelId}` : ""}` : event.type}</small></div></article>) : fallback.length ? fallback.map((job) => <article key={job.id}><time>{dateLabel(job.updatedAt ?? job.startedAt)}</time><div><b>{job.type}</b><small>{job.status} · {job.progress ?? 0}%</small></div></article>) : <p>还没有可展示的工作流事件。启动生成后，智能体分工与模型分配会在这里出现。</p>}
  </div>;
}

const slideWidth = 13.333;
const slideHeight = 7.5;
function elementStyle(element: PresentationElement): React.CSSProperties {
  return {
    left: `${(element.x / slideWidth) * 100}%`,
    top: `${(element.y / slideHeight) * 100}%`,
    width: `${(element.width / slideWidth) * 100}%`,
    height: `${(element.height / slideHeight) * 100}%`,
    opacity: element.opacity ?? 1,
    transform: `rotate(${element.rotation ?? 0}deg)`,
  };
}
function PresentationElementView({ element, selected, interactive, onSelect }: { element: PresentationElement; selected: boolean; interactive: boolean; onSelect?: () => void }) {
  const base = `${styles.presentationElement} ${selected ? styles.presentationElementSelected : ""}`;
  const Tag = interactive ? "button" : "div";
  if (element.type === "text") return <Tag {...(interactive ? { type: "button" as const } : {})} className={`${base} ${styles.presentationText}`} style={{ ...elementStyle(element), color: element.color ?? "#17231F", fontFamily: element.fontFamily, fontSize: `${Math.max(7, (element.fontSize ?? 24) * .075)}cqw`, fontWeight: element.bold ? 800 : 400, fontStyle: element.italic ? "italic" : "normal", textAlign: element.align ?? "left", alignItems: element.verticalAlign === "middle" ? "center" : element.verticalAlign === "bottom" ? "flex-end" : "flex-start" }} onClick={onSelect}>{element.text}</Tag>;
  if (element.type === "image") return <Tag {...(interactive ? { type: "button" as const } : {})} className={base} style={elementStyle(element)} onClick={onSelect}><img src={element.src} alt={element.alt ?? ""} style={{ objectFit: element.fit === "fill" ? "fill" : element.fit ?? "cover" }}/></Tag>;
  if (element.type === "chart") {
    const values = element.series[0]?.values ?? [];
    const maximum = Math.max(1, ...values.map((value) => Math.abs(value)));
    const colors = element.colorScheme?.length ? element.colorScheme : ["#426B57", "#F28B50"];
    const gap = 18; const barWidth = values.length ? Math.max(18, (560 - gap * (values.length + 1)) / values.length) : 40;
    return <div role={interactive ? "button" : undefined} tabIndex={interactive ? 0 : undefined} aria-label={element.name ?? "可编辑图表"} className={base} style={elementStyle(element)} onClick={onSelect}><svg viewBox="0 0 600 320" width="100%" height="100%" role="img" aria-label={element.series.map(({ name }) => name).join("、")}><line x1="24" y1="270" x2="580" y2="270" stroke="#AAB7B0" strokeWidth="2"/>{values.map((value, index) => { const height = Math.max(3, Math.abs(value) / maximum * 210); const x = gap + index * (barWidth + gap); return <g key={`${element.id}-${index}`}><rect x={x} y={270 - height} width={barWidth} height={height} rx="5" fill={colors[index % colors.length]}/>{element.showValues ? <text x={x + barWidth / 2} y={255 - height} textAnchor="middle" fontSize="17" fill="#17231F">{value}{element.unit}</text> : null}<text x={x + barWidth / 2} y="300" textAnchor="middle" fontSize="15" fill="#52615A">{element.categories[index] ?? ""}</text></g>; })}</svg></div>;
  }
  if (element.type === "table") return <div role={interactive ? "button" : undefined} tabIndex={interactive ? 0 : undefined} aria-label={element.name ?? "可编辑表格"} className={base} style={{ ...elementStyle(element), overflow: "hidden" }} onClick={onSelect}><table style={{ width: "100%", height: "100%", borderCollapse: "collapse", color: element.textColor ?? "#17231F", fontSize: "1.25cqw" }}><thead style={{ background: element.headerColor ?? "#426B57", color: "#fff" }}><tr>{element.columns.map((column) => <th key={column.key} style={{ padding: "2%", textAlign: "left", border: "1px solid rgba(255,255,255,.35)" }}>{column.label}</th>)}</tr></thead><tbody style={{ background: element.bodyColor ?? "#F6F5EF" }}>{element.rows.map((row, rowIndex) => <tr key={`${element.id}-${rowIndex}`}>{element.columns.map((column) => <td key={column.key} style={{ padding: "2%", border: "1px solid #CAD5CF" }}>{String(row[column.key] ?? "")}</td>)}</tr>)}</tbody></table></div>;
  const line = element.shape === "line" || element.shape === "arrow";
  return <Tag {...(interactive ? { type: "button" as const } : {})} aria-label={interactive ? element.name ?? `${element.shape ?? "shape"} 形状` : undefined} className={`${base} ${styles.presentationShape}`} style={{ ...elementStyle(element), background: line ? "transparent" : element.fill ?? "#D7E4DC", borderColor: element.stroke ?? element.fill ?? "#6F7E76", borderWidth: line ? 0 : Math.max(0, element.strokeWidth ?? 1), borderRadius: element.shape === "ellipse" ? "50%" : element.shape === "roundRect" ? "8%" : 0 }} onClick={onSelect}>{line ? <span style={{ height: Math.max(1, element.strokeWidth ?? 1), background: element.stroke ?? element.fill ?? "#6F7E76" }}/>: null}</Tag>;
}
function PresentationSlide({ slide, selectedElementId, interactive = true, onSelect }: { slide: SlideSpec; selectedElementId?: string; interactive?: boolean; onSelect?: (id: string) => void }) {
  return <div className={styles.presentationSlide} style={{ background: slide.background ?? "#F6F5EF" }} data-slide-id={slide.id}>
    {slide.elements?.length ? slide.elements.map((element) => <PresentationElementView key={element.id} element={element} selected={selectedElementId === element.id} interactive={interactive} onSelect={interactive ? () => onSelect?.(element.id) : undefined}/>) : <div className={styles.slideEmpty}><b>{slide.title || "空白页面"}</b><span>这页还没有可渲染元素。可返回生成阶段重试，已有文档不会被替换。</span></div>}
  </div>;
}
function stageStatus(workbench: ProjectWorkbench, stage: ProjectStage) {
  const project = workbench.project;
  if (stage === "brief") return project.outline.length || project.slides.length ? "已完成" : project.brief.topic ? "进行中" : "未开始";
  if (stage === "outline") return project.outline.length ? "已完成" : "未开始";
  if (stage === "generate") return project.generationStale ? "需要更新" : project.generationStatus === "failed" ? "执行失败" : ["queued", "running"].includes(project.generationStatus) ? "进行中" : project.slides.length ? "已完成" : "未开始";
  if (stage === "edit") return project.slides.length ? "进行中" : "未开始";
  if (stage === "review") return !project.qualityReport ? "未开始" : reportPassed(project) ? "已完成" : "需要更新";
  return project.exportJobs.some((job) => job.revision === project.revision && job.status === "success") ? "已完成" : project.exportJobs.length ? "需要更新" : "未开始";
}

function Heading({ label, title, copy, action }: { label: string; title: string; copy: string; action?: React.ReactNode }) {
  return <div className={styles.heading}><div><p className={styles.eyebrow}>{label}</p><h1>{title}</h1><p>{copy}</p></div>{action}</div>;
}
function Assistant({ stage }: { stage: ProjectStage }) {
  const data: Record<ProjectStage, [string, string, string[]]> = {
    brief: ["等待确认", "核对听众、场景与边界，再把一句话变成可执行需求。", ["补齐汇报目的", "识别资料缺口", "压缩需求范围"]],
    outline: ["蓝图协作", "调整故事线、章节和页面数量，同时守住核心主张。", ["精简故事线", "增加数据页", "重排章节"]],
    generate: ["生成监控", "离开页面后任务仍属于这个项目，回来可以继续查看。", ["查看任务事件", "检查资料使用", "生成失败重试"]],
    edit: ["当前页协作", "选择修改范围后再下指令；单页修改不会重写整份演示。", ["优化当前页", "换布局", "减少文字"]],
    review: ["问题解释", "解释扣分依据，保留证据状态，并定位到正确页面。", ["解释主要扣分", "查看安全修复", "定位风险页面"]],
    export: ["交付准备", "基于当前版本准备讲稿、摘要和分享文案。", ["生成演讲摘要", "整理分享文案", "检查交付清单"]],
  };
  const [status, copy, actions] = data[stage];
  return <aside className={styles.aside}><div className={styles.assistantHead}><img src="/observatory/aippt-orbit-mark.png" alt="页核项目助手"/><div><b>页核 · 项目助手</b><small>{status}</small></div></div><p className={styles.assistantCopy}>{copy}</p><div className={styles.assistantActions}>{actions.map((action) => <button className={styles.quickButton} key={action} disabled title="该快捷动作尚未接入当前项目"><Sparkles size={13}/>{action}</button>)}</div></aside>;
}

function Brief({ project, reload }: { project: PresentationProject; reload: () => Promise<void> }) {
  const { snapshot } = useCommercial();
  const router = useRouter();
  const pages = project.brief.pageCount || project.slides.length;
  const cost = Math.max(8, pages * 3); const balance = snapshot?.account.creditBalance ?? 300;
  const [questions, setQuestions] = useState<string[]>();
  const [answers, setAnswers] = useState<Record<string, string>>(project.brief.answers);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const confirmed = project.outline.length > 0;
  useEffect(() => {
    if (confirmed) return;
    let stopped = false;
    const load = async () => {
      setError(undefined);
      try {
        const response = await fetch(`${apiOrigin}/api/projects/${encodeURIComponent(project.id)}/questions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ topic: project.brief.topic, originalPrompt: project.brief.originalPrompt || project.brief.topic, audience: project.brief.audience ?? [], goal: project.brief.purpose, language: project.brief.language, slideCount: pages || 8, answers: project.brief.answers }) });
        const payload = await response.json() as { questions?: string[]; error?: { message?: string } };
        if (!response.ok) throw new Error(payload.error?.message || "需求追问加载失败");
        if (!stopped) setQuestions((payload.questions ?? []).slice(0, 3));
      } catch (reason) { if (!stopped) setError(reason instanceof Error ? reason.message : "需求追问加载失败"); }
    };
    void load();
    return () => { stopped = true; };
  }, [confirmed, pages, project.brief.answers, project.brief.audience, project.brief.language, project.brief.originalPrompt, project.brief.purpose, project.brief.topic, project.id]);
  const confirm = async () => {
    if (questions?.some((question) => !answers[question]?.trim())) return;
    setBusy(true); setError(undefined);
    try {
      const response = await fetch(`${apiOrigin}/api/projects/${encodeURIComponent(project.id)}/blueprint`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ topic: project.brief.topic, originalPrompt: project.brief.originalPrompt || project.brief.topic, audience: project.brief.audience ?? [], goal: project.brief.purpose, language: project.brief.language, slideCount: pages || 8, answers, confirmed: true }) });
      const payload = await response.json().catch(() => undefined) as { error?: { message?: string } } | undefined;
      if (!response.ok) throw new Error(payload?.error?.message || "蓝图创建失败");
      await reload(); router.push(projectHref(project.id, "outline"));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "需求确认失败"); }
    finally { setBusy(false); }
  };
  const action = confirmed ? <Link className={styles.primary} href={projectHref(project.id, "outline")}>查看已确认蓝图 <ArrowRight size={15}/></Link> : <button className={styles.primary} onClick={() => void confirm()} disabled={busy || questions === undefined || questions.some((question) => !answers[question]?.trim())}>{busy ? <LoaderCircle size={15}/> : <Check size={15}/>}确认答案并建立蓝图</button>;
  return <><Heading label="01 / PROJECT BRIEF" title="先把任务说清楚" copy="最多三次追问。答案确认前不会建立蓝图，也不会启动页面生成。" action={action}/><div className={styles.grid}><section className={styles.panel}><p className={styles.panelTitle}>原始指令 / ORIGINAL PROMPT</p><p className={styles.prompt}>“{project.brief.originalPrompt || project.brief.topic || "等待补充项目需求"}”</p><div className={styles.facts}><div className={styles.fact}><span>面向</span><b>{project.brief.audience?.join("、") || "由追问确认"}</b></div><div className={styles.fact}><span>页数</span><b>{pages || 8} 页</b></div><div className={styles.fact}><span>预计时长</span><b>{Math.max(5, Math.round((pages || 8) * 1.6))} 分钟</b></div><div className={styles.fact}><span>目的</span><b>{project.brief.purpose || "由追问确认"}</b></div><div className={styles.fact}><span>场景</span><b>{project.brief.scenario || "由追问确认"}</b></div><div className={styles.fact}><span>资料</span><b>{project.brief.sourceFileIds.length} 份已用于项目</b></div></div>{confirmed ? <p className={styles.notice}>需求答案已确认，蓝图共 {project.outline.length} 页。修改需求后需要重新确认。</p> : <div className={styles.questionList}><p className={styles.panelTitle}>需求追问 · 最多 3 项</p>{questions === undefined && !error ? <p className={styles.notice}>正在根据当前主题准备追问…</p> : questions?.length ? questions.map((question, index) => <label key={question}><span>{String(index + 1).padStart(2, "0")} · {question}</span><textarea value={answers[question] ?? ""} onChange={(event) => setAnswers((current) => ({ ...current, [question]: event.target.value }))} placeholder="输入你的确认答案"/></label>) : !error ? <p className={styles.notice}>当前需求无需额外追问，请确认后建立蓝图。</p> : null}{error && <p className={styles.warning} role="alert">{error}</p>}</div>}<p className={styles.notice}>预计生成 {pages || 8} 页 · 预计 {Math.max(8, (pages || 8) * 3)} AI 点 · 当前余额 {balance} 点。</p></section><Assistant stage="brief"/></div></>;
}
function slideType(index: number, length: number) { return index === 0 ? "封面" : index === length - 1 ? "总结" : ["问题", "数据", "流程", "对比", "案例", "行动计划"][index % 6]; }
function Outline({ project }: { project: PresentationProject }) {
  const outline = project.outline.length ? project.outline : project.slides.map((slide) => ({ id: `outline-${slide.id}`, title: slide.title, slideId: slide.id, purpose: undefined, section: undefined }));
  return <><Heading label="02 / PRESENTATION BLUEPRINT" title="先统一叙事，再进入版面" copy="核心主张、章节与逐页目的都绑定当前项目。" action={outline.length ? <Link className={styles.primary} href={projectHref(project.id, "generate")}>确认蓝图 <ArrowRight size={15}/></Link> : <button className={styles.primary} disabled title="先在需求阶段确认追问答案">等待需求确认</button>}/><div className={styles.grid}><section className={styles.panel}><p className={styles.panelTitle}>STORYLINE · {outline.length} PAGES</p>{outline.length ? <div className={styles.outlineList}>{outline.map((item, index) => <article className={styles.outlineItem} key={item.id}><b>{String(index + 1).padStart(2, "0")}</b><div><strong>{item.title}</strong><small>{item.purpose || item.section || "支撑项目核心主张"}</small></div><span className={styles.slideType}>{slideType(index, outline.length)}</span></article>)}</div> : <div className={styles.empty}>页核还在等待需求确认。<Link className={styles.button} href={projectHref(project.id, "brief")}>返回需求</Link></div>}</section><Assistant stage="outline"/></div></>;
}
function Generate({ workbench, reload }: { workbench: ProjectWorkbench; reload: () => Promise<void> }) {
  const { project } = workbench; const job = latestJob(workbench, "generate");
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string>(); const [upgrade, setUpgrade] = useState<UpgradeReason>(); const [qualityProfile, setQualityProfile] = useState<"standard" | "premium">("standard");
  useEffect(() => { if (!job || !["queued", "running"].includes(job.status)) return; const timer = setTimeout(() => void reload(), 2500); return () => clearTimeout(timer); }, [job?.id, job?.status, job?.progress, reload]);
  const run = async () => { if (!project.outline.length) { setError("请先返回需求阶段，确认追问答案并建立蓝图。"); return; } setBusy(true); setError(undefined); try { const advanced = qualityProfile === "premium" ? "advanced" as const : "standard" as const; const estimated = await estimateCredits({ action: "generate", pageCount: project.brief.pageCount, projectId: project.id, textModel: advanced, imageModel: advanced }); if (!estimated.estimate.allowed || !estimated.estimate.sufficient) { const reason = reasonFromEstimate(estimated.estimate); setUpgrade(reason); if (reason === "insufficient_credits") void track("credits_exhausted", { projectId: project.id, metadata: { cost: estimated.estimate.cost, balance: estimated.estimate.balance } }); return; } void track("generation_started", { projectId: project.id, metadata: { cost: estimated.estimate.cost, qualityProfile } }); const response = await fetch(`${apiOrigin}/api/projects/${encodeURIComponent(project.id)}/generate`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...project.brief, slideCount: project.brief.pageCount, qualityProfile, idempotencyKey: `${project.id}:generate:${qualityProfile}:s${project.sourceRevision}` }) }); if (!response.ok) throw new Error(await response.text()); await reload(); } catch (reason) { setError(reason instanceof Error ? reason.message : "生成任务启动失败"); } finally { setBusy(false); } };
  const progress = job?.progress ?? (project.slides.length ? 100 : 0);
  return <><Heading label="03 / GENERATION" title={project.generationStale ? "需求或蓝图已经变化" : productCopy.generation.runningTitle} copy={productCopy.generation.runningBody} action={!project.slides.length || project.generationStale ? <button className={styles.primary} onClick={() => void run()} disabled={busy}>{busy ? <LoaderCircle size={15}/> : <Play size={15}/>}重新生成当前蓝图</button> : <Link className={styles.primary} href={projectHref(project.id, "edit")} onClick={() => void track("editor_opened", { projectId: project.id })}>进入编辑器 <ArrowRight size={15}/></Link>}/><div className={styles.grid}><section className={styles.panel}><p className={styles.panelTitle}>生成质量</p><div className={styles.scope} role="radiogroup" aria-label="生成质量档位"><button type="button" role="radio" aria-checked={qualityProfile === "standard"} className={qualityProfile === "standard" ? styles.scopeActive : ""} onClick={() => setQualityProfile("standard")}>标准 · 完整门禁</button><button type="button" role="radio" aria-checked={qualityProfile === "premium"} className={qualityProfile === "premium" ? styles.scopeActive : ""} onClick={() => setQualityProfile("premium")}>精品 · 逐页审稿</button></div>{project.generationStale && <p className={styles.warning}>需求或蓝图已修改；已有页面仍然保留，但质量报告与导出已标记为旧结果。确认后可重新生成。</p>}{error && <p className={styles.warning}>{productCopy.generation.failedBody}<br/>{error}</p>}<div className={styles.progressCard}><div className={styles.progressTop}><b>{project.generationStale ? "现有页面需要更新" : project.slides.length ? "页面已生成" : job?.status === "failed" ? productCopy.generation.failedTitle : productCopy.generation.idleTitle}</b><span>{project.generationStale ? 0 : progress}%</span></div><div className={styles.progressTrack}><span style={{ width: `${project.generationStale ? 0 : progress}%` }}/></div><div className={styles.jobMeta}><span>PROJECT / {project.id}</span><span>REVISION / 版本 {project.revision}</span><span>STATUS / {project.generationStale ? "stale" : job?.status ?? project.generationStatus}</span></div></div><div className={styles.facts}><div className={styles.fact}><span>01</span><b>理解目标与听众</b></div><div className={styles.fact}><span>02</span><b>搭建故事线</b></div><div className={styles.fact}><span>03</span><b>逐页组织内容</b></div></div>{job?.status === "failed" && <button className={styles.button} onClick={() => void store.retry(job.id).then(reload)}><RefreshCw size={14}/>{productCopy.generation.retry}</button>}<WorkflowFeed projectId={project.id} jobs={workbench.jobs}/></section><Assistant stage="generate"/></div><UpgradeModal reason={upgrade} onClose={() => setUpgrade(undefined)} resumeAction={{ type: "generate", projectId: project.id, payload: { qualityProfile } }}/></>;
}

function Editor({ workbench, reload }: { workbench: ProjectWorkbench; reload: () => Promise<void> }) {
  const searchParams = useSearchParams(); const locatedSlideId = searchParams.get("slideId") || undefined; const locatedElementId = searchParams.get("elementId") || undefined;
  const project = workbench.project; const [activeId, setActiveId] = useState(locatedSlideId ?? project.activeSlideId ?? project.slides[0]?.id); const [tab, setTab] = useState("ai"); const [scope, setScope] = useState("page"); const [instruction, setInstruction] = useState(""); const [title, setTitle] = useState(project.title); const [save, setSave] = useState("已保存"); const [selectedElementId, setSelectedElementId] = useState(locatedElementId); const [historyOpen, setHistoryOpen] = useState(false); const [historyEntries, setHistoryEntries] = useState<Array<{ id: string; sequence: number; undone: boolean; createdAt: string }>>([]);
  useEffect(() => { if (locatedSlideId && project.slides.some(({ id }) => id === locatedSlideId)) setActiveId(locatedSlideId); setSelectedElementId(locatedElementId); }, [locatedElementId, locatedSlideId, project.slides]);
  const activeSlide = project.slides.find((slide) => slide.id === activeId) ?? project.slides[0]; const issueCount = project.qualityReport?.issues.filter((issue) => issue.slideId === activeSlide?.id).length ?? 0;
  const updateTitle = async () => { if (!workbench.presentationId || !title.trim() || title.trim() === project.title) return; setSave("保存中"); try { const response = await fetch(`${apiOrigin}/api/presentations/${encodeURIComponent(workbench.presentationId)}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ baseRevision: project.revision, title: title.trim() }) }); if (!response.ok) throw new Error(); setSave("已保存"); await reload(); } catch { setSave("保存失败"); } };
  const undo = async () => { if (!workbench.presentationId) return; setSave("保存中"); try { const response = await fetch(`${apiOrigin}/api/presentations/${encodeURIComponent(workbench.presentationId)}/undo`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ baseRevision: project.revision }) }); if (!response.ok) throw new Error(); setSave("已保存"); await reload(); } catch { setSave("保存失败"); } };
  const apply = async () => { if (!instruction.trim() || !activeSlide || !workbench.presentationId || (scope === "element" && !selectedElementId)) return; setSave("AI 修改中"); try { const response = await fetch(`${apiOrigin}/api/presentations/${encodeURIComponent(workbench.presentationId)}/ai-edit`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ slideId: activeSlide.id, ...(scope === "element" && selectedElementId ? { elementId: selectedElementId } : {}), scope, instruction, baseRevision: project.revision }) }); if (!response.ok) throw new Error(); setInstruction(""); setSave("已保存"); await reload(); } catch { setSave("保存失败"); } };
  const loadHistory = async () => { if (!workbench.presentationId) return; if (historyOpen) { setHistoryOpen(false); return; } try { const response = await fetch(`${apiOrigin}/api/presentations/${encodeURIComponent(workbench.presentationId)}/history`, { cache: "no-store" }); if (!response.ok) throw new Error(); const payload = await response.json() as { history?: typeof historyEntries }; setHistoryEntries(payload.history ?? []); setHistoryOpen(true); } catch { setSave("版本历史加载失败"); } };
  const next = reportPassed(project) ? ["去交付", "export"] as const : project.qualityReport ? ["重新检查", "review"] as const : ["去检查", "review"] as const;
  return <><Heading label="04 / EDITOR" title="编辑内容，而不是编辑上下文" copy="正式标题和原始指令已分离；画布、预览与导出读取同一份 PresentationDocument。" action={<Link className={styles.primary} href={projectHref(project.id, next[1])}>{next[0]} <ArrowRight size={15}/></Link>}/>{project.generationStale && <p className={styles.warning}>当前页面来自旧蓝图。内容仍可查看和编辑，但重新生成前不能把它视为最新需求的结果。</p>}{!reportIsCurrent(project) && <p className={styles.warning}>整份演示需要重新检查 · 当前页 {issueCount} 个历史问题 · 当前版本 版本 {project.revision}</p>}<div className={styles.editorGrid}><aside className={styles.thumbs}>{project.slides.map((slide, index) => <button className={`${styles.thumb} ${slide.id === activeSlide?.id ? styles.thumbActive : ""}`} key={slide.id} onClick={() => { setActiveId(slide.id); setSelectedElementId(undefined); }}><div className={styles.thumbPreview}><span>{String(index + 1).padStart(2, "0")}</span><PresentationSlide slide={slide} selectedElementId={undefined} interactive={false}/></div><small>{slide.title || `第 ${index + 1} 页`}</small></button>)}</aside><section className={styles.canvas}><div className={styles.canvasTools}><button className={styles.iconButton} onClick={() => void undo()} title="撤销"><Undo2 size={16}/></button><button className={styles.iconButton} disabled title="重做尚未接入当前版本"><Redo2 size={16}/></button><button className={styles.button} disabled title="布局切换尚未接入当前文档"><LayoutTemplate size={14}/>换布局</button><span>{save} · {dateLabel(project.updatedAt)} · 版本 {project.revision}</span></div><div className={styles.canvasStage}>{activeSlide ? <PresentationSlide slide={activeSlide} selectedElementId={selectedElementId} onSelect={setSelectedElementId}/> : <div className={styles.empty}>还没有可编辑页面。返回生成阶段创建当前项目的演示。</div>}</div><div className={styles.canvasFoot}>第 {Math.max(1, project.slides.findIndex((slide) => slide.id === activeSlide?.id) + 1)} / {project.slides.length} 页 · 当前页问题 {issueCount} 条{selectedElementId ? ` · 已选 ${selectedElementId}` : ""}</div></section><aside className={styles.inspector}><div className={styles.tabs}>{[["ai","AI 修改"],["props","属性"],["design","设计"]].map(([id,label]) => <button className={tab === id ? styles.tabActive : ""} key={id} onClick={() => setTab(id)} disabled={id === "design"} title={id === "design" ? "设计面板尚未接入当前文档" : undefined}>{label}</button>)}</div>{tab === "ai" ? <><div className={styles.scope}>{[["element","当前元素"],["page","当前页"],["section","当前章节"],["deck","整份风格"]].map(([id,label]) => <button className={scope === id ? styles.scopeActive : ""} key={id} onClick={() => setScope(id)}>{label}</button>)}</div><textarea className={styles.textarea} value={instruction} onChange={(event) => setInstruction(event.target.value)} placeholder="例如：保留数据，把这页改成结论先行"/><div className={styles.inspectorActions}><button className={styles.primary} onClick={() => void apply()} disabled={!instruction.trim() || (scope === "element" && !selectedElementId)}><Send size={14}/>预览并应用</button><button className={styles.iconButton} onClick={() => void undo()}><RotateCcw size={15}/></button></div>{scope === "element" && !selectedElementId ? <p className={styles.warning}>请在画布中选择一个元素，或从质量问题定位到元素。</p> : <p className={styles.assistantCopy}>本次只会修改：{scope === "element" ? `元素 ${selectedElementId}` : scope === "page" ? "当前页" : scope === "section" ? "当前章节" : "整份演示的页面内容"}。</p>}<div className={styles.quickGrid}>{["优化当前页", "换布局", "减少文字", "增加视觉", "转为图表", "强化结论"].map((action) => <button className={styles.quickButton} key={action} onClick={() => { setScope("page"); setInstruction(action); }}>{action}</button>)}</div></> : <><p className={styles.panelTitle}>演示标题</p><input className={styles.titleInput} value={title} onChange={(event) => setTitle(event.target.value)} onBlur={() => void updateTitle()}/><p className={styles.panelTitle}>当前元素</p><p className={styles.assistantCopy}>{selectedElementId ?? "尚未选择元素"}</p><p className={styles.panelTitle}>原始指令（只读）</p><p className={styles.assistantCopy}>{project.brief.originalPrompt}</p></>}<div className={styles.history}><b><History size={13}/> 页面与项目版本</b><p>当前 版本 {project.revision} · 保存和 AI 修改均可追溯，撤销会形成新版本。</p><button className={styles.button} onClick={() => void loadHistory()}><MoreHorizontal size={14}/>{historyOpen ? "收起版本历史" : "查看版本历史"}</button>{historyOpen && <div className={styles.taskList}>{historyEntries.length ? historyEntries.map((entry) => <small key={entry.id}>版本操作 #{entry.sequence} · {entry.undone ? "已撤销" : "有效"} · {dateLabel(entry.createdAt)}</small>) : <small>当前历史窗口内还没有可撤销的页面操作。</small>}</div>}</div></aside></div></>;
}

function evidence(issue: QualityIssue) { if (issue.verification === "manual") return "需要人工确认"; if (issue.verification === "unverifiable") return "自动检查无法验证 · 需要人工确认"; if (issue.verification === "verified") return "已由确定性规则验证"; return issue.severity === "error" ? "存在风险" : "已由规则定位"; }
function Review({ workbench, reload }: { workbench: ProjectWorkbench; reload: () => Promise<void> }) {
  const { project } = workbench; const [busy, setBusy] = useState(false); const [error, setError] = useState<string>(); const current = reportIsCurrent(project); const report = project.qualityReport;
  const majorDeductions = report?.majorDeductions ?? []; const majorCopy = majorDeductions.length ? majorDeductions.map(({ code, points }) => `${code} -${points}`).join("；") : "当前没有自动扣分";
  const check = async () => { setBusy(true); setError(undefined); try { await store.checkQuality(); await reload(); } catch (reason) { setError(reason instanceof Error ? reason.message : "质量检查失败"); } finally { setBusy(false); } };
  return <><Heading label="05 / QUALITY CENTER" title="交付前，逐页校准" copy="分数来自真实检查结果；事实、版权与来源不会在缺乏证据时被标记为通过。" action={<button className={styles.primary} onClick={() => void check()} disabled={busy || !workbench.presentationId}>{busy ? <LoaderCircle size={15}/> : <RefreshCw size={15}/>}重新检查</button>}/>{!current && <p className={styles.warning}>质量报告过期：报告基于 版本 {report?.revision ?? "—"}，当前演示为 版本 {project.revision}。请重新检查后再判断是否达到交付标准。</p>}{error && <p className={styles.warning}>{error}</p>}<div className={styles.qualityGrid}><section className={styles.scoreCard}><p className={styles.panelTitle}>交付健康度</p><div className={styles.score}><b>{report?.score ?? "—"}</b><small>/ 100</small></div><b>{current ? "报告与当前版本一致" : "当前分数不可作为交付结论"}</b><p>基于 版本 {report?.revision ?? "—"} · {report?.issues.length ?? 0} 条问题<br/>主要扣分：{majorCopy}</p>{report?.checks.length ? <div className={styles.taskList}>{report.checks.map((item) => <small key={item.id}>{item.label} · {item.status} · {item.message}</small>)}</div> : null}</section><section className={styles.issueList}>{report?.issues.length ? report.issues.map((issue, index) => <article className={styles.issue} key={`${issue.code}-${issue.slideId ?? index}`}><AlertTriangle size={18}/><div><b>{issue.slideId ? `${issue.slideId} · ` : "整份演示 · "}{issue.code}</b><p>{issue.message}</p><span className={styles.evidence}>{evidence(issue)}</span></div><div className={styles.issueActions}><Link className={styles.button} href={`${projectHref(project.id, "edit")}?slideId=${encodeURIComponent(issue.slideId ?? "")}&elementId=${encodeURIComponent(issue.elementId ?? "")}`}><LocateFixed size={13}/>定位{issue.elementId ? "元素" : "页面"}</Link><button className={styles.button} disabled title="自动修复方案尚未接入当前检查结果">查看方案</button></div></article>) : <div className={styles.empty}>{current ? "当前版本未发现自动检查问题。" : "还没有当前版本的质量报告。"}</div>}</section></div></>;
}
const formats: Array<[ExportFormat, string, string]> = [["pptx","PPTX","文字、图片和形状可在 PowerPoint 中继续编辑"],["pdf","PDF","稳定阅读与分享"],["png","PNG","逐页高清图片"],["html","HTML","离线单文件演示"],["html-zip","HTML ZIP","包含演示数据与主题"]];
function ExportView({ workbench, reload }: { workbench: ProjectWorkbench; reload: () => Promise<void> }) {
  const { snapshot, refresh: refreshCommercial } = useCommercial(); const project = workbench.project; const [format, setFormat] = useState<ExportFormat>("pptx"); const [resumeFormat, setResumeFormat] = useState<ExportFormat>(); const [busy, setBusy] = useState(false); const [error, setError] = useState<string>(); const [completed, setCompleted] = useState(false); const [upgrade, setUpgrade] = useState<UpgradeReason>(); const current = reportPassed(project); const tasks = useMemo(() => [...project.exportJobs].reverse(), [project.exportJobs]); const isPro = snapshot?.account.planId === "pro"; const unbranded = isPro;
  const run = async (requested = format) => { if (requested === "pptx" && !isPro && snapshot?.entitlements.freeBrandedPptxExports === 0) { setUpgrade("unbranded_pptx"); return; } setBusy(true); setError(undefined); try { void track("export_clicked", { projectId: project.id, presentationId: workbench.presentationId, metadata: { format: requested, branding: unbranded ? "none" : "aippt" } }); await store.export(requested); setCompleted(true); await Promise.all([reload(), refreshCommercial()]); } catch (reason) { const message = reason instanceof Error ? reason.message : "导出任务创建失败"; if (message.includes("FEATURE_NOT_ENTITLED") || message.includes("FREE_PPTX_LIMIT_REACHED") || message.includes("UPGRADE_REQUIRED")) setUpgrade(requested === "pptx" ? "unbranded_pptx" : "export_format"); else setError(message); } finally { setBusy(false); } };
  useEffect(() => { const resume = takeResumeAction(); if (resume?.type === "export" && resume.projectId === project.id) { const next = (resume.payload?.format as ExportFormat) || "pptx"; setFormat(next); setResumeFormat(next); } }, [project.id]);
  useEffect(() => { if (!resumeFormat || !isPro || busy) return; setResumeFormat(undefined); void run(resumeFormat); }, [resumeFormat, isPro]);
  const choose = (next: ExportFormat) => { if ((next === "pdf" || next === "png") && !isPro) { setUpgrade("export_format"); return; } setFormat(next); };
  return <><Heading label="06 / DELIVERY CENTER" title="交付当前这一版" copy={`即将导出 ${project.title} · 版本 ${project.revision} · ${project.slides.length} 页。预览、文件和任务都绑定当前项目版本。`}/>{!current && <p className={styles.warning}>当前质量报告{project.qualityReport ? `基于版本 ${project.qualityReport.revision}` : "尚未生成"}，已过期或缺失。<Link href={projectHref(project.id, "review")}>先检查</Link>，或确认风险后仍然导出 版本 {project.revision}。</p>}{error && <p className={styles.warning}>{error}</p>}{completed && <p className={styles.notice}>导出成功，交付任务已创建。</p>}<div className={styles.exportGrid}><section className={styles.panel}><p className={styles.panelTitle}>EXPORT FORMAT</p><div className={styles.formats}>{formats.map(([id,label,copy]) => <button className={`${styles.format} ${format === id ? styles.formatActive : ""}`} key={id} onClick={() => choose(id)}><Download size={19}/><b>{id === "pptx" ? (unbranded ? "无品牌 PPTX" : "带品牌 PPTX") : label}</b><small>{copy}{(id === "pdf" || id === "png") && !isPro ? " · Pro" : ""}</small></button>)}</div><p className={styles.notice}>{format === "pptx" ? (unbranded ? "本次将导出无 AIPPT 标识的可编辑 PPTX。" : "Free 将导出带 AIPPT 标识的可编辑 PPTX；升级 Pro 可切换为无品牌。") : (format === "pdf" || format === "png") ? "PDF / PNG 高清导出为 Pro 交付权益。" : "HTML 交付将按照当前开发配置执行。"}</p><p className={styles.notice}>导出成功后，可在这里获取当前版本的交付文件。</p><button className={styles.primary} onClick={() => void run()} disabled={busy || !workbench.presentationId} style={{ width: "100%", marginTop: 18 }}>{busy ? <LoaderCircle size={16}/> : <MonitorUp size={16}/>}导出 版本 {project.revision} · {project.slides.length} 页</button><div className={styles.taskList}>{tasks.length ? tasks.map((task) => <article className={styles.task} key={task.id}><div className={styles.taskTop}><b>{task.format.toUpperCase()} · 版本 {task.revision}</b><span>{task.status} · {task.progress ?? (task.status === "success" ? 100 : 0)}%</span></div><div className={styles.progressTrack}><span style={{ width: `${task.progress ?? (task.status === "success" ? 100 : 0)}%` }}/></div><small>{task.status === "queued" ? "准备资源" : task.status === "running" ? "处理字体 · 渲染页面 · 生成文件" : task.status === "failed" ? task.error ?? "导出失败" : task.status === "stale" ? "演示已修改，此文件来自旧版本" : "导出成功"}</small>{task.status === "failed" && <button className={styles.button} onClick={() => void store.retry(task.id).then(reload)}><RefreshCw size={13}/>重试</button>}{task.downloadUrl && <a className={styles.button} href={task.downloadUrl}>获取文件</a>}</article>) : <div className={styles.empty}>还没有导出记录。选择格式后创建当前版本任务。</div>}</div></section><aside className={styles.aside}><p className={styles.panelTitle}>DELIVERY SUMMARY</p><div className={styles.summaryList}><div><span>项目</span><b>{project.title}</b></div><div><span>版本</span><b>版本 {project.revision}</b></div><div><span>页数</span><b>{project.slides.length} 页</b></div><div><span>最后保存</span><b>{dateLabel(project.updatedAt)}</b></div><div><span>质量</span><b>{current ? `版本 ${project.revision} 有效` : "过期 / 未检查"}</b></div></div><p className={styles.notice}>分享链接默认仅持链接者可查看；文件权限、过期时间和撤销入口会在创建分享时明确确认。</p><Assistant stage="export"/></aside></div><UpgradeModal reason={upgrade} onClose={() => setUpgrade(undefined)} resumeAction={{ type: "export", projectId: project.id, presentationId: workbench.presentationId, payload: { format, unbranded: true } }}/></>;
}
function Stage({ stage, workbench, reload }: { stage: ProjectStage; workbench: ProjectWorkbench; reload: () => Promise<void> }) {
  if (stage === "brief") return <Brief project={workbench.project} reload={reload}/>; if (stage === "outline") return <Outline project={workbench.project}/>; if (stage === "generate") return <Generate workbench={workbench} reload={reload}/>; if (stage === "edit") return <Editor workbench={workbench} reload={reload}/>; if (stage === "review") return <Review workbench={workbench} reload={reload}/>; return <ExportView workbench={workbench} reload={reload}/>;
}

export function ProjectRouteShell({ projectId, stage }: { projectId: string; stage: ProjectStage }) {
  return <CommercialProvider><ProjectRouteShellContent projectId={projectId} stage={stage}/></CommercialProvider>;
}
function ProjectRouteShellContent({ projectId, stage }: { projectId: string; stage: ProjectStage }) {
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  useEffect(() => { void store.open(projectId); }, [projectId]);
  if (state.projectId !== projectId || state.loading) return <main className={styles.error} aria-busy="true"><LoaderCircle size={28}/><h1>{productCopy.projects.loading}</h1><p>{productCopy.projects.loadingDetail}</p></main>;
  if (state.error) return <main className={styles.error} role="alert"><AlertTriangle size={28}/><h1>{productCopy.projects.errorTitle}</h1><p>{state.error}</p><button className={styles.primary} onClick={() => void store.open(projectId)}>{productCopy.projects.retry}</button><Link className={styles.button} href="/?view=projects">返回项目列表</Link></main>;
  if (!state.workbench) return <main className={styles.error} role="alert"><FileText size={28}/><h1>项目不存在</h1><p>请选择一个真实项目后再进入检查或交付。</p><Link className={styles.button} href="/?view=projects">返回项目列表</Link></main>;
  const workbench = state.workbench; const { project } = workbench; const current = reportPassed(project); const reload = () => store.open(projectId);
  return <main className={styles.shell} data-project-id={projectId} data-project-stage={stage}><header className={styles.topbar}><Link className={styles.brand} href="/"><img src="/observatory/aippt-orbit-mark-64.png" alt="AIPPT"/><strong>AIPPT</strong></Link><Link className={styles.back} href="/?view=projects"><ChevronLeft size={13}/>项目</Link><div className={styles.projectName}><b>{project.title}</b><small>{workbench.source === "api" ? `已保存 · ${dateLabel(project.updatedAt)}` : "离线恢复 · 等待同步"}</small></div><div className={styles.topMeta}><span className={styles.pill}>v{project.revision}</span><span className={`${styles.pill} ${current ? styles.pillOk : styles.pillWarn}`}>{current ? "质量报告有效" : "需要重新检查"}</span><CommercialStatus/><button className={styles.button} disabled title="分享链接尚未接入当前项目"><MessageSquareShare size={14}/>分享</button><Link className={styles.primary} href={projectHref(project.id, "export")}><Download size={14}/>导出</Link></div></header><nav className={styles.stagebar} aria-label="项目制作阶段">{stageItems.map((item, index) => { const status = stageStatus(workbench, item.id); return <Link className={`${styles.stage} ${stage === item.id ? styles.stageCurrent : ""} ${status === "已完成" ? styles.stageDone : ""} ${status === "需要更新" || status === "执行失败" ? styles.stageNeeds : ""}`} href={projectHref(project.id, item.id)} key={item.id}><span className={styles.stageIndex}>{status === "已完成" ? <Check size={11}/> : String(index + 1).padStart(2, "0")}</span><span><b>{item.label}</b><small>{status === "已完成" ? "完成" : status}</small></span></Link>; })}</nav><section className={styles.main}><Stage stage={stage} workbench={workbench} reload={reload}/></section></main>;
}
