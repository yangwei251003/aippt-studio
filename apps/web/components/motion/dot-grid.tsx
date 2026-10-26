/* React Bits-derived application integration. Copyright (c) 2026 David Haz.
 * MIT + Commons Clause; see licenses/react-bits/LICENSE.md and THIRD_PARTY_ASSETS.md.
 * Local changes: Next/TypeScript adaptation, product styling, lifecycle/accessibility integration. */
"use client";

import { memo, useCallback, useEffect, useMemo, useRef, type CSSProperties } from "react";
import { gsap } from "gsap";
import { InertiaPlugin } from "gsap/InertiaPlugin";
import styles from "./dot-grid.module.css";

type DotGridProps = { className?: string; style?: CSSProperties; dotSize?: number; gap?: number; baseColor?: string; activeColor?: string; proximity?: number; speedTrigger?: number; shockRadius?: number; shockStrength?: number; maxSpeed?: number; resistance?: number; returnDuration?: number };
type Dot = { cx: number; cy: number; xOffset: number; yOffset: number; inertiaApplied: boolean };
type PointerState = { x: number; y: number; vx: number; vy: number; speed: number; lastTime: number; lastX: number; lastY: number };
type Rgb = { r: number; g: number; b: number };

function throttle<T extends (...args: never[]) => void>(callback: T, limit: number) {
  let lastCall = 0;
  return (...args: Parameters<T>) => {
    const now = performance.now();
    if (now - lastCall < limit) return;
    lastCall = now;
    callback(...args);
  };
}

function hexToRgb(hex: string): Rgb {
  const match = hex.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
  if (!match) return { r: 0, g: 0, b: 0 };
  return { r: parseInt(match[1], 16), g: parseInt(match[2], 16), b: parseInt(match[3], 16) };
}

function DotGrid({ className = "", style, dotSize = 16, gap = 32, baseColor = "#5227ff", activeColor = "#5227ff", proximity = 150, speedTrigger = 100, shockRadius = 250, shockStrength = 5, maxSpeed = 5000, resistance = 750, returnDuration = 1.5 }: DotGridProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dotsRef = useRef<Dot[]>([]);
  const reducedMotionRef = useRef(false);
  const pointerRef = useRef<PointerState>({ x: -10_000, y: -10_000, vx: 0, vy: 0, speed: 0, lastTime: 0, lastX: 0, lastY: 0 });
  const baseRgb = useMemo(() => hexToRgb(baseColor), [baseColor]);
  const activeRgb = useMemo(() => hexToRgb(activeColor), [activeColor]);
  const circlePath = useMemo(() => {
    if (typeof window === "undefined" || !window.Path2D) return null;
    const path = new window.Path2D();
    path.arc(0, 0, dotSize / 2, 0, Math.PI * 2);
    return path;
  }, [dotSize]);

  const buildGrid = useCallback(() => {
    const wrap = wrapperRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const { width, height } = wrap.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    canvas.getContext("2d")?.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cell = dotSize + gap;
    const cols = Math.max(1, Math.floor((width + gap) / cell));
    const rows = Math.max(1, Math.floor((height + gap) / cell));
    const startX = (width - (cell * cols - gap)) / 2 + dotSize / 2;
    const startY = (height - (cell * rows - gap)) / 2 + dotSize / 2;
    const dots: Dot[] = [];
    for (let y = 0; y < rows; y += 1) for (let x = 0; x < cols; x += 1) dots.push({ cx: startX + x * cell, cy: startY + y * cell, xOffset: 0, yOffset: 0, inertiaApplied: false });
    dotsRef.current = dots;
  }, [dotSize, gap]);

  useEffect(() => {
    if (!circlePath) return;
    let frame = 0;
    const proximitySquared = proximity * proximity;
    const draw = () => {
      const canvas = canvasRef.current;
      const context = canvas?.getContext("2d");
      if (!canvas || !context) return;
      context.clearRect(0, 0, canvas.width, canvas.height);
      const { x: pointerX, y: pointerY } = pointerRef.current;
      for (const dot of dotsRef.current) {
        const dx = dot.cx - pointerX;
        const dy = dot.cy - pointerY;
        const distanceSquared = dx * dx + dy * dy;
        let fill = baseColor;
        let scale = 1;
        if (distanceSquared <= proximitySquared) {
          const ratio = 1 - Math.sqrt(distanceSquared) / proximity;
          fill = `rgb(${Math.round(baseRgb.r + (activeRgb.r - baseRgb.r) * ratio)},${Math.round(baseRgb.g + (activeRgb.g - baseRgb.g) * ratio)},${Math.round(baseRgb.b + (activeRgb.b - baseRgb.b) * ratio)})`;
          if (!reducedMotionRef.current) scale += ratio * .72;
        }
        context.save();
        context.translate(dot.cx + dot.xOffset, dot.cy + dot.yOffset);
        context.scale(scale, scale);
        context.fillStyle = fill;
        context.fill(circlePath);
        context.restore();
      }
      frame = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(frame);
  }, [activeRgb, baseColor, baseRgb, circlePath, proximity]);

  useEffect(() => {
    buildGrid();
    const observer = new ResizeObserver(buildGrid);
    if (wrapperRef.current) observer.observe(wrapperRef.current);
    return () => observer.disconnect();
  }, [buildGrid]);

  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    reducedMotionRef.current = reducedMotion;
    if (!reducedMotion) gsap.registerPlugin(InertiaPlugin);
    const returnHome = (dot: Dot) => gsap.to(dot, { xOffset: 0, yOffset: 0, duration: returnDuration, ease: "elastic.out(1,0.75)", onComplete: () => { dot.inertiaApplied = false; } });
    const onMove = (event: MouseEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const now = performance.now();
      const pointer = pointerRef.current;
      const elapsed = pointer.lastTime ? now - pointer.lastTime : 16;
      let vx = ((event.clientX - pointer.lastX) / elapsed) * 1000;
      let vy = ((event.clientY - pointer.lastY) / elapsed) * 1000;
      let speed = Math.hypot(vx, vy);
      if (speed > maxSpeed) { const scale = maxSpeed / speed; vx *= scale; vy *= scale; speed = maxSpeed; }
      Object.assign(pointer, { lastTime: now, lastX: event.clientX, lastY: event.clientY, vx, vy, speed });
      const rect = canvas.getBoundingClientRect();
      pointer.x = event.clientX - rect.left;
      pointer.y = event.clientY - rect.top;
      if (reducedMotion) return;
      for (const dot of dotsRef.current) {
        const distance = Math.hypot(dot.cx - pointer.x, dot.cy - pointer.y);
        if (speed <= speedTrigger || distance >= proximity || dot.inertiaApplied) continue;
        dot.inertiaApplied = true;
        gsap.killTweensOf(dot);
        gsap.to(dot, { inertia: { xOffset: dot.cx - pointer.x + vx * 0.005, yOffset: dot.cy - pointer.y + vy * 0.005, resistance }, onComplete: () => returnHome(dot) });
      }
    };
    const onClick = (event: MouseEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const clickX = event.clientX - rect.left;
      const clickY = event.clientY - rect.top;
      for (const dot of dotsRef.current) {
        const distance = Math.hypot(dot.cx - clickX, dot.cy - clickY);
        if (distance >= shockRadius || dot.inertiaApplied) continue;
        dot.inertiaApplied = true;
        gsap.killTweensOf(dot);
        const falloff = Math.max(0, 1 - distance / shockRadius);
        gsap.to(dot, { inertia: { xOffset: (dot.cx - clickX) * shockStrength * falloff, yOffset: (dot.cy - clickY) * shockStrength * falloff, resistance }, onComplete: () => returnHome(dot) });
      }
    };
    const throttledMove = throttle(onMove, 18);
    window.addEventListener("mousemove", throttledMove, { passive: true });
    if (!reducedMotion) window.addEventListener("click", onClick);
    return () => { window.removeEventListener("mousemove", throttledMove); if (!reducedMotion) window.removeEventListener("click", onClick); gsap.killTweensOf(dotsRef.current); };
  }, [maxSpeed, proximity, resistance, returnDuration, shockRadius, shockStrength, speedTrigger]);

  return <section className={`${styles.dotGrid} ${className}`} style={style} aria-hidden="true"><div ref={wrapperRef} className={styles.wrap}><canvas ref={canvasRef} className={styles.canvas} /></div></section>;
}

export default memo(DotGrid);
