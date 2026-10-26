"use client";

import { memo, type CSSProperties } from "react";
import styles from "./newtons-cradle.module.css";

type NewtonsCradleProps = { label?: string; size?: number; className?: string };

function NewtonsCradle({ label = "正在处理", size = 42, className = "" }: NewtonsCradleProps) {
  const variables = { "--uib-size": `${size}px` } as CSSProperties;
  return <span className={`${styles.cradle} ${className}`} style={variables} role="status" aria-label={label}><i className={styles.dot} /><i className={styles.dot} /><i className={styles.dot} /><i className={styles.dot} /></span>;
}

export default memo(NewtonsCradle);
