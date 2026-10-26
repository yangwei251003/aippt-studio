"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight, Bell, BookOpen, Check, CircleAlert, Clock3, Coins, FolderKanban,
  Layers3, LoaderCircle, MessageSquareText, Pause, Play, RefreshCw, Settings2, Sparkles, Users,
} from "lucide-react";
import {
  getCreatorProjectSummary, listCreatorMessages, markAllCreatorMessagesRead,
  setCreatorMessageRead, type CreatorMessage, type CreatorMessageKind,
} from "../../lib/creator-center";
import { SpecularLink } from "../motion/specular-action";
import { useCommercial } from "../commercial/commercial-provider";
import styles from "./creator-center.module.css";

const Aurora = dynamic(() => import("../backgrounds/aurora"), { ssr: false });
const CREATOR_AURORA_STOPS: [string, string, string] = ["#d2f235", "#7fae7a", "#2f5041"];

type Filter = "all" | "unread" | CreatorMessageKind;

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: "all", label: "全部" },
  { id: "unread", label: "未读" },
  { id: "collaboration", label: "协作" },
  { id: "resource", label: "资源" },
  { id: "system", label: "系统" },
  { id: "milestone", label: "创作进展" },
];

const KIND_META: Record<CreatorMessageKind, { label: string; icon: typeof Bell }> = {
  collaboration: { label: "协作消息", icon: Users },
  resource: { label: "资源更新", icon: Layers3 },
  system: { label: "系统通知", icon: Bell },
  milestone: { label: "创作进展", icon: Sparkles },
};

function timeLabel(value: string): string {
  const elapsed = Date.now() - new Date(value).getTime();
  const minutes = Math.max(1, Math.floor(elapsed / 60_000));
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  return `${days} 天前`;
}

export default function CreatorCenter() {
  const { snapshot, loading: accountLoading } = useCommercial();
  const [messages, setMessages] = useState<CreatorMessage[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();
  const [projectSummary, setProjectSummary] = useState<{ count: number; latest?: { id: string; name: string; updatedAt: string } }>({ count: 0 });
  const [backgroundPaused, setBackgroundPaused] = useState(false);

  const load = async () => {
    setLoading(true); setError(undefined);
    try {
      const [messageResult, projects] = await Promise.all([listCreatorMessages(), getCreatorProjectSummary()]);
      setMessages(messageResult.messages);
      setProjectSummary(projects);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "个人中心暂时无法连接");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const unread = messages.filter(({ readAt }) => !readAt).length;
  const visible = useMemo(() => messages.filter((message) => {
    if (filter === "all") return true;
    if (filter === "unread") return !message.readAt;
    return message.kind === filter;
  }), [messages, filter]);
  const account = snapshot?.account;

  const toggleRead = async (message: CreatorMessage) => {
    setBusy(message.id);
    try {
      const result = await setCreatorMessageRead(message.id, !message.readAt);
      setMessages((current) => current.map((item) => item.id === message.id ? result.message : item));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "消息状态更新失败");
    } finally {
      setBusy(undefined);
    }
  };

  const markAll = async () => {
    if (!unread) return;
    setBusy("all");
    try {
      const result = await markAllCreatorMessagesRead();
      setMessages(result.messages);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "暂时无法全部标为已读");
    } finally {
      setBusy(undefined);
    }
  };

  return <main className={styles.page}>
    <div className={styles.auroraBackground} aria-hidden="true"><Aurora colorStops={CREATOR_AURORA_STOPS} blend={0.5} amplitude={1} speed={0.5} paused={backgroundPaused}/></div>
    <button className={styles.motionToggle} type="button" aria-pressed={backgroundPaused} onClick={() => setBackgroundPaused((paused) => !paused)}>{backgroundPaused ? <Play size={13}/> : <Pause size={13}/>}<span>{backgroundPaused ? "播放极光" : "暂停极光"}</span></button>
    <header className={styles.nav}>
      <Link className={styles.brand} href="/"><img src="/observatory/aippt-orbit-mark-64.png" alt="AIPPT"/><strong>AIPPT</strong><span>CREATOR CONSOLE</span></Link>
      <nav aria-label="个人中心导航"><Link href="/?view=projects">项目</Link><Link href="/resources">资源中心</Link><Link href="/account/usage">用量</Link><Link href="/account/billing">账单</Link></nav>
    </header>

    <section className={styles.profile}>
      <div className={styles.identity}><div className={styles.avatar}>YW<span/></div><div><p>CREATOR / LOCAL WORKSPACE</p><h1>杨伟的创作者中心</h1><span>项目、资源、权益和站内消息统一汇总在这里。</span></div></div>
      <div className={styles.stats}>
        <div><FolderKanban/><span>真实项目</span><b>{loading ? "—" : projectSummary.count}</b></div>
        <div><MessageSquareText/><span>未读消息</span><b>{loading ? "—" : unread}</b></div>
        <div><Coins/><span>AI 点数</span><b>{accountLoading ? "—" : account?.creditBalance ?? 300}</b></div>
        <div><Sparkles/><span>当前套餐</span><b>{accountLoading ? "—" : account?.planId === "pro" ? "PRO" : "FREE"}</b></div>
      </div>
    </section>

    <div className={styles.workspace}>
      <section className={styles.inbox}>
        <div className={styles.sectionHead}><div><p>INBOX / CREATOR SIGNALS</p><h2>消息中心</h2></div><div className={styles.inboxActions}><button onClick={() => void load()} disabled={loading}><RefreshCw className={loading ? styles.spin : ""} size={14}/>刷新</button><button onClick={() => void markAll()} disabled={!unread || busy === "all"}><Check size={14}/>全部已读</button></div></div>
        <div className={styles.filters} role="tablist" aria-label="消息类型">{FILTERS.map((item) => <button role="tab" aria-selected={filter === item.id} className={filter === item.id ? styles.filterActive : ""} key={item.id} onClick={() => setFilter(item.id)}>{item.label}{item.id === "unread" && unread ? <span>{unread}</span> : null}</button>)}</div>

        {error && <div className={styles.error} role="alert"><CircleAlert/><div><b>个人中心暂时无法完成同步</b><p>{error}</p></div><button onClick={() => void load()}>重新连接</button></div>}
        {loading ? <div className={styles.skeleton} aria-label="正在接收消息">{[0,1,2].map((item) => <div key={item}><i/><span/><small/></div>)}</div> : visible.length ? <div className={styles.messageList}>{visible.map((message) => {
          const meta = KIND_META[message.kind]; const Icon = meta.icon; const isUnread = !message.readAt;
          return <article className={`${styles.message} ${isUnread ? styles.unread : ""}`} key={message.id}>
            <div className={styles.messageIcon}><Icon size={18}/>{isUnread && <i/>}</div>
            <div className={styles.messageBody}><div><span>{meta.label}</span><time><Clock3 size={11}/>{timeLabel(message.createdAt)}</time></div><h3>{message.title}</h3><p>{message.body}</p><div className={styles.messageActions}><Link href={message.actionHref} onClick={() => { if (isUnread) void toggleRead(message); }}>{message.actionLabel}<ArrowRight size={13}/></Link><button onClick={() => void toggleRead(message)} disabled={busy === message.id}>{busy === message.id ? <LoaderCircle className={styles.spin} size={13}/> : isUnread ? <Check size={13}/> : <Bell size={13}/>} {isUnread ? "标为已读" : "设为未读"}</button></div></div>
          </article>;
        })}</div> : <div className={styles.empty}><MessageSquareText/><h3>{filter === "unread" ? "消息都处理完了" : "这里暂时没有消息"}</h3><p>{filter === "unread" ? "新的协作反馈、资源审核和系统通知会继续出现在这里。" : "切换其他分类，或刷新接收最新消息。"}</p></div>}
      </section>

      <aside className={styles.rail}>
        <section><p>CREATOR SHORTCUTS</p><h2>继续创作</h2><SpecularLink href="/?view=create">创建新演示 <ArrowRight size={14}/></SpecularLink><Link href="/?view=projects"><FolderKanban size={15}/><span>项目工作台<small>{projectSummary.latest ? `最近：${projectSummary.latest.name}` : "查看所有项目"}</small></span></Link><Link href="/resources"><BookOpen size={15}/><span>资源中心<small>模板、Skill 与图片</small></span></Link><Link href="/account/usage"><Coins size={15}/><span>点数与权益<small>查看余额和记录</small></span></Link><Link href="/account/billing"><Settings2 size={15}/><span>账户设置<small>套餐与账单</small></span></Link></section>
        <section className={styles.sage}><img src="/generated/production/sage-sage-listening/sage-sage-listening-512.png" alt="正在接收消息的页核"/><div><p>PAGE CORE / LISTENING</p><b>页核会把项目状态和需要你确认的事项送到这里。</b><span><i/> 消息链路在线</span></div></section>
      </aside>
    </div>
  </main>;
}
