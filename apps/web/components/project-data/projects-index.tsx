"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Check, Copy, Download, MoreHorizontal, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { projectHref } from "../../lib/project-routes";
import { HttpProjectRepository } from "../../lib/project-repository";
import type { ProjectWorkbench, RemoteProjectRecord } from "../../lib/project-types";
import styles from "./workbench.module.css";

const apiOrigin = process.env.NEXT_PUBLIC_API_ORIGIN ?? "/backend-api";
const repository = new HttpProjectRepository(apiOrigin);
type Card = { record: RemoteProjectRecord; workbench?: ProjectWorkbench };

function relativeTime(value: string) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 1) return "刚刚编辑";
  if (minutes < 60) return `${minutes} 分钟前编辑`;
  if (minutes < 1440) return `${Math.round(minutes / 60)} 小时前编辑`;
  return `${Math.round(minutes / 1440)} 天前编辑`;
}

function resumeStage(workbench?: ProjectWorkbench) {
  const project = workbench?.project;
  if (!project) return "brief" as const;
  if (project.slides.length) return project.qualityReport ? "review" as const : "edit" as const;
  if (project.outline.length) return "outline" as const;
  return "brief" as const;
}

export function ProjectsIndex({ onCreate }: { onCreate: () => void }) {
  const [cards, setCards] = useState<Card[]>([]); const [query, setQuery] = useState(""); const [loading, setLoading] = useState(true); const [error, setError] = useState<string>(); const [menu, setMenu] = useState<string>(); const [signal, setSignal] = useState("已同步");
  const load = async () => { setLoading(true); setError(undefined); try { const response = await fetch(`${apiOrigin}/api/projects`, { cache: "no-store" }); if (!response.ok) throw new Error(`PROJECTS_HTTP_${response.status}`); const list = (await response.json()).projects as RemoteProjectRecord[]; const hydrated = await Promise.all(list.map(async (record) => { try { return { record, workbench: await repository.getWorkbench(record.id) }; } catch { return { record }; } })); setCards(hydrated); setSignal("已同步"); } catch { setError("暂时无法连接项目服务，请稍后重试"); setSignal("同步失败"); } finally { setLoading(false); } };
  useEffect(() => { void load(); }, []);
  useEffect(() => { window.addEventListener("aippt-create", onCreate); return () => window.removeEventListener("aippt-create", onCreate); }, [onCreate]);
  const filtered = useMemo(() => cards.filter(({ record }) => `${record.name} ${record.topic ?? ""}`.toLowerCase().includes(query.trim().toLowerCase())), [cards, query]);
  const rename = async (card: Card) => { const name = window.prompt("新的项目名称", card.record.name)?.trim(); if (!name) return; setSignal("保存中"); const response = await fetch(`${apiOrigin}/api/projects/${encodeURIComponent(card.record.id)}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) }); if (response.ok) await load(); else setSignal("保存失败"); };
  const duplicate = async (card: Card) => { setSignal("保存中"); const response = await fetch(`${apiOrigin}/api/projects`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: `${card.record.name}（副本）`, topic: card.record.topic || card.record.name }) }); if (response.ok) { const project = (await response.json()).project as RemoteProjectRecord; window.location.assign(projectHref(project.id, "brief")); } else setSignal("保存失败"); };
  const remove = async (card: Card) => { if (!window.confirm(`删除“${card.record.name}”？此操作无法撤销。`)) return; setSignal("保存中"); const response = await fetch(`${apiOrigin}/api/projects/${encodeURIComponent(card.record.id)}`, { method: "DELETE" }); if (response.ok) await load(); else setSignal("保存失败"); };
  return <section className={styles.projectPage}><Heading/><div className={styles.projectTools}><label className={styles.searchBox}><Search size={16}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索项目"/></label><span className={styles.saveSignal}><Check size={13}/>{signal}</span></div>{loading ? <div className={styles.empty}>正在加载真实项目…</div> : error ? <div className={styles.empty}>项目加载失败：{error}<button className={styles.button} onClick={() => void load()}>重新加载</button></div> : filtered.length ? <div className={styles.projectGrid}>{filtered.map((card, index) => { const project = card.workbench?.project; const issues = project?.qualityReport?.issues.length ?? 0; const exported = project?.exportJobs.find((job) => job.status === "success"); const stage = !project ? "需求" : project.slides.length ? project.qualityReport ? "检查" : "编辑" : project.outline.length ? "蓝图" : "需求"; const accent = ["#d2f235", "#ff6b47", "#8bc6ff"][index % 3]; return <article className={styles.projectCard} key={card.record.id}><Link href={projectHref(card.record.id, resumeStage(card.workbench))}><div className={styles.cover} style={{ ["--cover-accent" as string]: accent }}><small>{project?.slides[0]?.id ?? "AIPPT / BRIEF"}</small><b>{project?.slides[0]?.title || card.record.name}</b></div></Link><div className={styles.projectInfo}><h3>{project?.title || card.record.name}</h3><p>{stage}中 · 第 {stage === "需求" ? 1 : stage === "蓝图" ? 2 : stage === "编辑" ? 4 : 5}/6 阶段</p><p>{project?.slides.length ?? 0} 页 · {issues} 条待修复建议</p><p>{relativeTime(project?.updatedAt ?? card.record.updatedAt)} · {exported ? `已导出 ${exported.format.toUpperCase()}` : "尚未导出"}</p><div className={styles.projectActions}><Link className={styles.button} href={projectHref(card.record.id, resumeStage(card.workbench))}>继续编辑</Link><Link className={styles.iconButton} href={projectHref(card.record.id, "export")} title="导出"><Download size={14}/></Link><div className={styles.menuWrap}><button className={styles.iconButton} onClick={() => setMenu(menu === card.record.id ? undefined : card.record.id)}><MoreHorizontal size={15}/></button>{menu === card.record.id && <div className={styles.menu}><button onClick={() => void rename(card)}><Pencil size={12}/> 重命名</button><button onClick={() => void duplicate(card)}><Copy size={12}/> 复制项目</button><button onClick={() => void remove(card)}><Trash2 size={12}/> 删除</button></div>}</div></div></div></article>; })}</div> : <div className={styles.empty}>没有匹配的项目。<button className={styles.primary} onClick={onCreate}>创建第一份演示</button></div>}</section>;
}
function Heading() { return <div className={styles.heading}><div><p className={styles.eyebrow}>YOUR WORK / LIVE PROJECTS</p><h1>项目</h1><p>所有元信息、阶段和任务状态均来自当前项目数据。</p></div><button className={styles.primary} onClick={() => window.dispatchEvent(new Event("aippt-create"))}><Plus size={16}/>新建演示</button></div>; }
