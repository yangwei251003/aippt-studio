"use client";

import Link from "next/link";
import { useCommercial } from "./commercial-provider";
import styles from "./commercial.module.css";

export function CommercialStatus({ compact = false }: { compact?: boolean }) {
  const { snapshot, loading } = useCommercial(); const account = snapshot?.account; const plan = account?.planId === "pro" ? "Pro" : "Free"; const balance = account?.creditBalance ?? 300;
  return <span className={styles.accountStatus}><Link href="/account/usage">{loading ? "账户加载中" : `${plan} · ${balance} 点`}</Link>{plan === "Free" && !compact && <Link className={styles.statusUpgrade} href="/pricing">升级 Pro</Link>}</span>;
}
