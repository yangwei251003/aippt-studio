"use client";

import { memo, useRef, type CSSProperties, type ReactNode } from "react";
import styles from "./spotlight-glow-card.module.css";

type GlowCardProps = {
  children: ReactNode;
  className?: string;
  featured?: boolean;
  spotlightColor?: string;
};

type GlowVars = CSSProperties & Record<`--${string}`, string>;

function SpotlightGlowCard({ children, className = "", featured = false, spotlightColor = "rgba(210, 242, 53, .16)" }: GlowCardProps) {
  const cardRef = useRef<HTMLElement>(null);

  const handlePointerMove = (event: React.PointerEvent<HTMLElement>) => {
    const card = cardRef.current;
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const dx = x - rect.width / 2;
    const dy = y - rect.height / 2;
    const edge = Math.min(1, Math.max(Math.abs(dx) / Math.max(1, rect.width / 2), Math.abs(dy) / Math.max(1, rect.height / 2)));
    const angle = Math.atan2(dy, dx) * (180 / Math.PI) + 90;
    card.style.setProperty("--mouse-x", `${x}px`);
    card.style.setProperty("--mouse-y", `${y}px`);
    card.style.setProperty("--cursor-angle", `${angle}deg`);
    card.style.setProperty("--edge-proximity", edge.toFixed(3));
  };

  const vars = { "--spotlight-color": spotlightColor } as GlowVars;
  return <article
    ref={cardRef}
    tabIndex={0}
    onPointerMove={handlePointerMove}
    onPointerLeave={(event) => {
      event.currentTarget.style.setProperty("--mouse-x", "50%");
      event.currentTarget.style.setProperty("--mouse-y", "50%");
      event.currentTarget.style.setProperty("--edge-proximity", "0");
    }}
    className={`${styles.card} ${featured ? styles.featured : ""} ${className}`}
    style={vars}
  >
    <span className={styles.edgeLight} aria-hidden="true"/>
    <div className={styles.inner}>{children}</div>
  </article>;
}

export default memo(SpotlightGlowCard);
