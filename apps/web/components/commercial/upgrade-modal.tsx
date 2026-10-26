"use client";

import { useEffect, useState } from "react";
import { ArrowRight, LoaderCircle, X } from "lucide-react";
import { saveResumeAction, startCheckout, track, type ResumeAction, type UpgradeReason } from "../../lib/commercial";
import styles from "./commercial.module.css";

const copy: Record<UpgradeReason, [string, string]> = {
  insufficient_credits: ["AI 点数不足", "本次操作需要更多 AI 点。升级 Pro 后每月可获得 3,000 点。"],
  project_limit: ["免费版项目数已达上限", "Free 最多保留 3 个活跃项目；升级 Pro 后可扩展到 30 个。"],
  page_limit: ["免费版最多 10 页", "这份演示超过 Free 的单份页数上限；Pro 支持最多 30 页。"],
  advanced_model: ["此模型需要 Pro", "高级文本与图片模型会带来更丰富的表达控制。"],
  advanced_template: ["此模板需要 Pro", "Pro 可以使用全部视觉模板和品牌方向。"],
  unbranded_pptx: ["无品牌 PPTX 需要 Pro", "Free 导出会保留 AIPPT 标识；Pro 可导出无品牌可编辑 PPTX。"],
  advanced_image: ["高级图片生成需要 Pro", "升级后可使用高级图片能力，保持整份演示视觉一致。"],
  version_history: ["更长版本历史需要 Pro", "Free 保留 7 天历史，Pro 保留 90 天版本记录。"],
  export_format: ["此导出格式需要 Pro", "PDF 与 PNG 高清导出属于 Pro 交付权益。"],
};

export function UpgradeModal({ reason, resumeAction, onClose }: { reason?: UpgradeReason; resumeAction?: ResumeAction; onClose: () => void }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string>();
  useEffect(() => { if (reason) void track("upgrade_modal_viewed", { projectId: resumeAction?.projectId, presentationId: resumeAction?.presentationId, metadata: { reason } }); }, [reason, resumeAction]);
  if (!reason) return null; const [title, body] = copy[reason];
  const upgrade = async () => { setBusy(true); setError(undefined); if (resumeAction) saveResumeAction(resumeAction); const returnTo = resumeAction?.projectId ? `/projects/${encodeURIComponent(resumeAction.projectId)}/export` : "/account/billing"; try { const result = await startCheckout({ interval: "monthly", returnTo, resumeAction }); void track("upgrade_clicked", { projectId: resumeAction?.projectId, presentationId: resumeAction?.presentationId, metadata: { reason } }); void track("checkout_started", { projectId: resumeAction?.projectId, presentationId: resumeAction?.presentationId }); if (result.checkout.completeUrl) window.location.assign(result.checkout.completeUrl); } catch (cause) { setError((cause as Error & { status?: number }).status === 503 ? "正式支付尚未配置，当前环境不能模拟成功。" : "无法启动结算，请稍后重试。"); } finally { setBusy(false); } };
  return <div className={styles.overlay} role="dialog" aria-modal="true" aria-labelledby="upgrade-title"><section className={styles.modal}><button className={styles.close} onClick={onClose} aria-label="关闭"><X size={18}/></button><p className={styles.eyebrow}>AIPPT PRO</p><h2 id="upgrade-title">{title}</h2><p>{body}</p><ul><li>3000 AI 点 / 月</li><li>高级模型、模板和图片</li><li>无品牌 PPTX 与 PDF / PNG</li></ul><button className={styles.primary} onClick={() => void upgrade()} disabled={busy}>{busy && <LoaderCircle size={15}/>}升级 Pro <ArrowRight size={15}/></button>{error && <p className={styles.empty}>{error}</p>}<button className={styles.subtle} onClick={onClose}>稍后再说</button></section></div>;
}
