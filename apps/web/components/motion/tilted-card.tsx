"use client";

import { memo, useEffect, useRef, type ReactNode } from "react";
import styles from "./tilted-card.module.css";

type TiltedCardProps = { children: ReactNode; className?: string; baseRotate?: number; rotateAmplitude?: number; scaleOnHover?: number; paused?: boolean };

function TiltedCard({ children, className = "", baseRotate = 0, rotateAmplitude = 11, scaleOnHover = 1.035, paused = false }: TiltedCardProps) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const card = ref.current;
    if (!card) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
    const current = { x: 0, y: 0, scale: 1 };
    const target = { x: 0, y: 0, scale: 1 };
    let frame = 0;
    let active = false;
    const render = () => {
      current.x += (target.x - current.x) * 0.14;
      current.y += (target.y - current.y) * 0.14;
      current.scale += (target.scale - current.scale) * 0.14;
      card.style.transform = `perspective(800px) rotateZ(${baseRotate}deg) rotateX(${current.x}deg) rotateY(${current.y}deg) scale(${current.scale})`;
      const moving = Math.abs(target.x - current.x) + Math.abs(target.y - current.y) + Math.abs(target.scale - current.scale) > 0.015;
      if (active || moving) frame = requestAnimationFrame(render); else card.style.willChange = "auto";
    };
    const schedule = () => { cancelAnimationFrame(frame); card.style.willChange = "transform"; frame = requestAnimationFrame(render); };
    const move = (event: PointerEvent) => {
      if (paused || reducedMotion || coarsePointer) return;
      const rect = card.getBoundingClientRect();
      const offsetX = event.clientX - rect.left - rect.width / 2;
      const offsetY = event.clientY - rect.top - rect.height / 2;
      target.x = (offsetY / (rect.height / 2)) * -rotateAmplitude;
      target.y = (offsetX / (rect.width / 2)) * rotateAmplitude;
      schedule();
    };
    const enter = () => { if (!paused && !reducedMotion && !coarsePointer) { active = true; target.scale = scaleOnHover; schedule(); } };
    const leave = () => { active = false; target.x = 0; target.y = 0; target.scale = 1; schedule(); };
    card.style.transform = `perspective(800px) rotateZ(${baseRotate}deg)`;
    card.addEventListener("pointermove", move, { passive: true });
    card.addEventListener("pointerenter", enter);
    card.addEventListener("pointerleave", leave);
    return () => { cancelAnimationFrame(frame); card.removeEventListener("pointermove", move); card.removeEventListener("pointerenter", enter); card.removeEventListener("pointerleave", leave); };
  }, [baseRotate, paused, rotateAmplitude, scaleOnHover]);
  return <article ref={ref} className={`${styles.card} ${className}`}>{children}</article>;
}

export default memo(TiltedCard);
