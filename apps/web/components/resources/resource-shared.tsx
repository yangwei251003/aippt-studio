"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { ArrowLeft, ArrowRight, Check, ExternalLink, FileStack, Image as ImageIcon, LayoutTemplate, LoaderCircle, LockKeyhole, Pause, Play, ShieldCheck, Sparkles, Upload } from "lucide-react";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { bindResource, listResourceProjects } from "../../lib/resource-client";
import type { ResourceProject, ResourceSummary } from "../../lib/resource-types";
import styles from "./resources.module.css";

const Galaxy = dynamic(() => import("../backgrounds/galaxy"), { ssr: false });

export const KIND_LABELS: Record<ResourceSummary["kind"], string> = { "template-pptx": "PPTX 模板", "template-html": "HTML 演示", "template-image": "图片式 PPT", skill: "PPT Skill", media: "图片资源", showcase: "优秀案例", website: "资源网站" };
export const isTemplate = (resource: ResourceSummary) => resource.kind.startsWith("template-");
export const modeFor = (resource: ResourceSummary) => resource.creationMode ?? (resource.kind === "template-html" ? "html" : resource.kind === "template-image" ? "image" : "standard");

export function ResourceShell({ children, compact = false }: { children: ReactNode; compact?: boolean }) {
  const [backgroundPaused, setBackgroundPaused] = useState(false);
  return <main className={`${styles.page} ${compact ? styles.compact : ""}`}>
    {!compact ? <><div className={styles.backgroundLayer} aria-hidden="true"><Galaxy mouseRepulsion mouseInteraction={!backgroundPaused} density={1.5} glowIntensity={0.5} saturation={0.8} hueShift={240} disableAnimation={backgroundPaused}/></div><button className={styles.motionToggle} type="button" aria-pressed={backgroundPaused} onClick={() => setBackgroundPaused((paused) => !paused)}>{backgroundPaused ? <Play size={13}/> : <Pause size={13}/>}<span>{backgroundPaused ? "播放星河" : "暂停星河"}</span></button></> : null}
    <header className={styles.nav}><Link className={styles.brand} href="/"><img src="/observatory/aippt-orbit-mark-64.png" alt="AIPPT"/><strong>AIPPT</strong><span>RESOURCE LIBRARY</span></Link><nav aria-label="主导航"><Link href="/resources">资源中心</Link><Link href="/?view=projects">项目</Link><Link href="/pricing">定价</Link><Link className={styles.navUpload} href="/resources/upload"><Upload size={14}/>上传</Link></nav></header>{children}
  </main>;
}

export function ResourceCover({ resource, large = false }: { resource: ResourceSummary; large?: boolean }) {
  const seed = [...resource.id].reduce((sum, value) => sum + value.charCodeAt(0), 0);
  const hues = [72, 26, 198, 42, 156, 12]; const hue = hues[seed % hues.length];
  const icon = resource.kind === "skill" ? <Sparkles/> : resource.kind === "media" ? <ImageIcon/> : resource.kind === "website" ? <ExternalLink/> : resource.kind === "showcase" ? <FileStack/> : <LayoutTemplate/>;
  return <div className={`${styles.cover} ${large ? styles.coverLarge : ""}`} style={{ "--resource-hue": hue } as CSSProperties}>{resource.previewUrl ? <img className={styles.coverImage} src={resource.previewUrl} alt={`${resource.title} 模板预览`}/> : null}<div className={styles.coverShade}/><div className={styles.coverGrid}/><span className={styles.coverType}>{KIND_LABELS[resource.kind] ?? resource.kind}</span><div className={styles.coverTitle}>{icon}<b>{resource.title}</b></div><small>{resource.version} / {resource.author}</small></div>;
}

export function TierBadge({ resource }: { resource: ResourceSummary }) {
  if (resource.entitled && resource.tier !== "free") return <span className={`${styles.tier} ${styles.tierOwned}`}><Check size={11}/>已解锁</span>;
  if (resource.tier === "free") return <span className={styles.tier}>FREE</span>;
  if (resource.tier === "pro") return <span className={`${styles.tier} ${styles.tierPro}`}>PRO</span>;
  return <span className={`${styles.tier} ${styles.tierPaid}`}>¥{((resource.priceCents ?? 0) / 100).toFixed(2)}</span>;
}

export function ReviewBadge({ resource }: { resource: ResourceSummary }) {
  if (resource.reviewStatus === "auto-reviewed") return <span className={styles.review}><ShieldCheck size={12}/>自动审核 · 未经人工复核</span>;
  if (resource.visibility === "private") return <span className={styles.private}><LockKeyhole size={12}/>仅自己可见</span>;
  return <span className={styles.review}>{resource.reviewStatus === "scanning" ? "扫描中" : resource.reviewStatus}</span>;
}

export function BackLink({ href = "/resources", children = "返回资源中心" }: { href?: string; children?: ReactNode }) { return <Link className={styles.back} href={href}><ArrowLeft size={14}/>{children}</Link>; }

export function ProjectPicker({ resource, onClose }: { resource: ResourceSummary; onClose: () => void }) {
  const [projects, setProjects] = useState<ResourceProject[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState<string>(); const [busy, setBusy] = useState<string>();
  useEffect(() => { let active = true; void listResourceProjects().then((items) => { if (active) setProjects(items); }).catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "项目列表暂时不可用"); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, []);
  const select = async (project: ResourceProject) => { setBusy(project.id); setError(undefined); try { await bindResource(project.id, { resourceId: resource.id, resourceVersion: resource.version, creationMode: modeFor(resource), assetPolicy: { providers: ["seed"], licenseAllowlist: ["CC0-1.0", "PDM-1.0", "CC-BY-4.0", "generated"], allowAiGeneration: false, requireAttribution: true } }); window.location.assign(`/projects/${encodeURIComponent(project.id)}/brief`); } catch (reason) { setError(reason instanceof Error ? reason.message : "模板绑定失败"); setBusy(undefined); } };
  return <div className={styles.overlay} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="project-picker-title"><p className={styles.eyebrow}>BIND TO PROJECT</p><h2 id="project-picker-title">选择要继续的项目</h2><p>“{resource.title}”将按 {modeFor(resource).toUpperCase()} 模式绑定到项目，并进入现有六阶段工作台。</p>{loading ? <div className={styles.state}><LoaderCircle className={styles.spin} size={18}/>正在读取项目…</div> : error && !projects.length ? <div className={styles.state} role="alert">{error}</div> : projects.length ? <div className={styles.projectList}>{projects.map((project) => <button key={project.id} onClick={() => void select(project)} disabled={Boolean(busy)}><span><b>{project.name}</b><small>{project.topic || "尚未设置主题"}</small></span>{busy === project.id ? <LoaderCircle className={styles.spin} size={17}/> : <ArrowRight size={17}/>}</button>)}</div> : <div className={styles.state}>还没有可绑定项目。</div>}{error && projects.length ? <p className={styles.formError} role="alert">{error}</p> : null}<div className={styles.modalActions}><Link className={styles.primary} href={`/?view=create&templateId=${encodeURIComponent(resource.id)}&templateVersion=${encodeURIComponent(resource.version)}&creationMode=${modeFor(resource)}`}>新建演示</Link><button className={styles.secondary} onClick={onClose}>取消</button></div></section></div>;
}
