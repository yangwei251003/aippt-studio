/* React Bits-derived application integration. Copyright (c) 2026 David Haz.
 * MIT + Commons Clause; see licenses/react-bits/LICENSE.md and THIRD_PARTY_ASSETS.md.
 * Local changes: Next/TypeScript adaptation, product styling, lifecycle/accessibility integration. */
"use client";

import Link from "next/link";
import { memo, useEffect, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from "react";
import { gsap } from "gsap";
import styles from "./pill-nav.module.css";

export type PillNavItem = { label: string; href: string; ariaLabel?: string; onSelect?: (event: MouseEvent<HTMLAnchorElement>) => void };
type PillNavProps = { logo: ReactNode; brandLabel?: string; logoAlt?: string; homeHref?: string; onHomeClick?: (event: MouseEvent<HTMLAnchorElement>) => void; items: PillNavItem[]; activeHref?: string; className?: string; ease?: string; baseColor?: string; pillColor?: string; hoveredPillTextColor?: string; pillTextColor?: string; activeColor?: string; initialLoadAnimation?: boolean; mobileMenu?: boolean };
type CssVars = CSSProperties & Record<`--${string}`, string>;

function PillNav({ logo, brandLabel, logoAlt = "AIPPT 首页", homeHref = "/", onHomeClick, items, activeHref, className = "", ease = "power3.out", baseColor = "rgba(8,13,10,.82)", pillColor = "rgba(229,240,217,.055)", hoveredPillTextColor = "#10150d", pillTextColor = "#cbd5ca", activeColor = "#d2f235", initialLoadAnimation = true, mobileMenu = true }: PillNavProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const circleRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const timelineRefs = useRef<Array<gsap.core.Timeline | null>>([]);
  const activeTweenRefs = useRef<Array<gsap.core.Tween | null>>([]);
  const logoInnerRef = useRef<HTMLSpanElement>(null);
  const logoRef = useRef<HTMLAnchorElement>(null);
  const itemsRef = useRef<HTMLDivElement>(null);
  const hamburgerRef = useRef<HTMLButtonElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useRef(false);
  const cssVars = { "--base": baseColor, "--pill-bg": pillColor, "--hover-text": hoveredPillTextColor, "--pill-text": pillTextColor, "--active-dot": activeColor } as CssVars;

  useEffect(() => {
    let mounted = true;
    reducedMotion.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const layout = () => {
      if (!mounted) return;
      circleRefs.current.forEach((circle, index) => {
        const pill = circle?.parentElement;
        if (!circle || !pill) return;
        const { width, height } = pill.getBoundingClientRect();
        const radius = ((width * width) / 4 + height * height) / (2 * height);
        const diameter = Math.ceil(2 * radius) + 2;
        const delta = Math.ceil(radius - Math.sqrt(Math.max(0, radius * radius - (width * width) / 4))) + 1;
        circle.style.width = `${diameter}px`;
        circle.style.height = `${diameter}px`;
        circle.style.bottom = `-${delta}px`;
        const label = pill.querySelector<HTMLElement>(`.${styles.label}`);
        const hoverLabel = pill.querySelector<HTMLElement>(`.${styles.hoverLabel}`);
        timelineRefs.current[index]?.kill();
        gsap.set(circle, { xPercent: -50, scale: 0, transformOrigin: `50% ${diameter - delta}px` });
        if (label) gsap.set(label, { y: 0 });
        if (hoverLabel) gsap.set(hoverLabel, { y: Math.ceil(height + 100), opacity: 0 });
        const timeline = gsap.timeline({ paused: true });
        timeline.to(circle, { scale: 1.2, xPercent: -50, duration: 2, ease, overwrite: "auto" }, 0);
        if (label) timeline.to(label, { y: -(height + 8), duration: 2, ease, overwrite: "auto" }, 0);
        if (hoverLabel) timeline.to(hoverLabel, { y: 0, opacity: 1, duration: 2, ease, overwrite: "auto" }, 0);
        timelineRefs.current[index] = timeline;
      });
    };
    layout();
    const observer = new ResizeObserver(layout);
    if (itemsRef.current) observer.observe(itemsRef.current);
    void document.fonts?.ready.then(layout).catch(() => undefined);
    if (mobileMenuRef.current) gsap.set(mobileMenuRef.current, { visibility: "hidden", opacity: 0, y: 10 });
    if (initialLoadAnimation && !reducedMotion.current) {
      if (logoRef.current) gsap.fromTo(logoRef.current, { scale: 0 }, { scale: 1, duration: .6, ease });
      if (itemsRef.current) gsap.fromTo(itemsRef.current, { clipPath: "inset(0 100% 0 0 round 999px)" }, { clipPath: "inset(0 0% 0 0 round 999px)", duration: .6, ease, clearProps: "clipPath" });
    }
    return () => { mounted = false; observer.disconnect(); timelineRefs.current.forEach(timeline => timeline?.kill()); activeTweenRefs.current.forEach(tween => tween?.kill()); gsap.killTweensOf([logoRef.current, itemsRef.current, mobileMenuRef.current, logoInnerRef.current]); };
  }, [ease, initialLoadAnimation, items]);

  const handleEnter = (index: number) => {
    if (reducedMotion.current) return;
    const timeline = timelineRefs.current[index];
    if (!timeline) return;
    activeTweenRefs.current[index]?.kill();
    activeTweenRefs.current[index] = timeline.tweenTo(timeline.duration(), { duration: .3, ease, overwrite: "auto" });
  };
  const handleLeave = (index: number) => {
    if (reducedMotion.current) return;
    const timeline = timelineRefs.current[index];
    if (!timeline) return;
    activeTweenRefs.current[index]?.kill();
    activeTweenRefs.current[index] = timeline.tweenTo(0, { duration: .2, ease, overwrite: "auto" });
  };
  const handleLogoEnter = () => {
    if (reducedMotion.current || !logoInnerRef.current) return;
    gsap.fromTo(logoInnerRef.current, { rotate: 0 }, { rotate: 360, duration: .36, ease, overwrite: "auto" });
  };
  const toggleMobileMenu = () => {
    const next = !isMobileMenuOpen;
    setIsMobileMenuOpen(next);
    const lines = hamburgerRef.current?.querySelectorAll<HTMLElement>(`.${styles.hamburger}`);
    if (lines?.length === 2) {
      gsap.to(lines[0], { rotate: next ? 45 : 0, y: next ? 3 : 0, duration: .3, ease });
      gsap.to(lines[1], { rotate: next ? -45 : 0, y: next ? -3 : 0, duration: .3, ease });
    }
    const menu = mobileMenuRef.current;
    if (!menu) return;
    if (next) { gsap.set(menu, { visibility: "visible" }); gsap.fromTo(menu, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: .3, ease }); }
    else gsap.to(menu, { opacity: 0, y: 10, duration: .2, ease, onComplete: () => gsap.set(menu, { visibility: "hidden" }) });
  };
  const renderItem = (item: PillNavItem, index: number, mobile = false) => {
    const native = item.href.startsWith("#") || /^(https?:|mailto:|tel:|\/\/)/.test(item.href);
    const className = mobile ? `${styles.mobileLink} ${activeHref === item.href ? styles.mobileActive : ""}` : `${styles.pill} ${activeHref === item.href ? styles.active : ""}`;
    const content = mobile ? item.label : <><span className={styles.circle} aria-hidden="true" ref={element => { circleRefs.current[index] = element; }}/><span className={styles.labelStack}><span className={styles.label}>{item.label}</span><span className={styles.hoverLabel} aria-hidden="true">{item.label}</span></span></>;
    const common = { className, "aria-label": item.ariaLabel ?? item.label, "aria-current": activeHref === item.href ? "page" as const : undefined, onPointerEnter: mobile ? undefined : () => handleEnter(index), onPointerLeave: mobile ? undefined : () => handleLeave(index), onClick: (event: MouseEvent<HTMLAnchorElement>) => { item.onSelect?.(event); if (mobile) { setIsMobileMenuOpen(false); gsap.set(mobileMenuRef.current, { visibility: "hidden", opacity: 0 }); } } };
    return native ? <a href={item.href} {...common}>{content}</a> : <Link href={item.href} {...common}>{content}</Link>;
  };

  return <div className={`${styles.container} ${className}`} style={cssVars}><nav className={styles.nav} aria-label={logoAlt}><Link ref={logoRef} href={homeHref} className={styles.homeCluster} aria-label={logoAlt} onClick={onHomeClick} onMouseEnter={handleLogoEnter}><span ref={logoInnerRef} className={styles.logo}>{logo}</span>{brandLabel&&<span className={styles.brand}>{brandLabel}</span>}</Link><div ref={itemsRef} className={styles.items}><ul className={styles.list}>{items.map((item,index)=><li key={`${item.href}-${index}`}>{renderItem(item,index)}</li>)}</ul></div>{mobileMenu&&<button ref={hamburgerRef} type="button" className={styles.mobileButton} aria-label="打开导航菜单" aria-expanded={isMobileMenuOpen} onClick={toggleMobileMenu}><span className={styles.hamburger}/><span className={styles.hamburger}/></button>}</nav>{mobileMenu&&<div ref={mobileMenuRef} className={styles.mobileMenu}><ul className={styles.mobileList}>{items.map((item,index)=><li key={`mobile-${item.href}-${index}`}>{renderItem(item,index,true)}</li>)}</ul></div>}</div>;
}

export default memo(PillNav);
