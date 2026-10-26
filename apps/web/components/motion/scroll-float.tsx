/* React Bits-derived application integration. Copyright (c) 2026 David Haz.
 * MIT + Commons Clause; see licenses/react-bits/LICENSE.md and THIRD_PARTY_ASSETS.md.
 * Local changes: Next/TypeScript adaptation, product styling, lifecycle/accessibility integration. */
"use client";

import { createElement, memo, useEffect, useMemo, useRef, type ElementType, type RefObject } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import styles from "./scroll-float.module.css";

type ScrollFloatProps = { text?: string; children?: string; as?: ElementType; id?: string; scrollContainerRef?: RefObject<HTMLElement | null>; containerClassName?: string; textClassName?: string; animationDuration?: number; ease?: string; scrollStart?: string; scrollEnd?: string; stagger?: number; paused?: boolean };

function ScrollFloat({ text, children, as: Tag = "span", id, scrollContainerRef, containerClassName = "", textClassName = "", animationDuration = 1, ease = "back.inOut(2)", scrollStart = "center bottom+=50%", scrollEnd = "bottom bottom-=40%", stagger = 0.03, paused = false }: ScrollFloatProps) {
  const containerRef = useRef<HTMLElement>(null);
  const animationRef = useRef<gsap.core.Tween | null>(null);
  const content = text ?? children ?? "";
  const splitText = useMemo(() => Array.from(content).map((character, index) => character === "\n"
    ? createElement("br", { key: `break-${index}` })
    : createElement("span", { className: styles.char, "data-character": "", "aria-hidden": "true", key: `${character}-${index}` }, character === " " ? "\u00a0" : character)), [content]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    gsap.registerPlugin(ScrollTrigger);
    const characters = element.querySelectorAll<HTMLElement>("[data-character]");
    const scroller = scrollContainerRef?.current ?? window;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const context = gsap.context(() => {
      animationRef.current = reduceMotion
        ? gsap.fromTo(characters, { opacity: .38 }, {
          opacity: 1,
          stagger: Math.min(stagger, .015),
          scrollTrigger: { trigger: element, scroller, start: scrollStart, end: scrollEnd, scrub: true },
        })
        : gsap.fromTo(characters, { willChange: "opacity, transform", opacity: 0, yPercent: 120, scaleY: 2.3, scaleX: 0.7, transformOrigin: "50% 0%" }, {
          duration: animationDuration, ease, opacity: 1, yPercent: 0, scaleY: 1, scaleX: 1, stagger,
          scrollTrigger: { trigger: element, scroller, start: scrollStart, end: scrollEnd, scrub: true, invalidateOnRefresh: true, onLeave: () => gsap.set(characters, { opacity: 1, clearProps: "transform,willChange" }) },
        });
    }, element);
    return () => { animationRef.current = null; context.revert(); };
  }, [animationDuration, ease, scrollContainerRef, scrollEnd, scrollStart, stagger]);

  useEffect(() => {
    const animation = animationRef.current;
    if (!animation?.scrollTrigger) return;
    if (paused) animation.scrollTrigger.disable(false); else { animation.scrollTrigger.enable(); animation.scrollTrigger.refresh(); ScrollTrigger.update(); }
  }, [paused]);

  return createElement(Tag, { ref: containerRef, id, className: `${styles.scrollFloat} ${containerClassName}`, style: Tag === "span" ? { display: "inline-block" } : undefined, "aria-label": content }, createElement("span", { className: `${styles.text} ${textClassName}` }, splitText));
}

export default memo(ScrollFloat);
