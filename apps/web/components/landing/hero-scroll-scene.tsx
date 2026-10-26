"use client";

import { useEffect, useRef } from "react";
import styles from "./hero-scroll-scene.module.css";

type HeroScrollSceneProps = {
  onBegin: () => void;
  onProjects: () => void;
};

const ACT_RANGES = [
  [0, 0.18],
  [0.18, 0.38],
  [0.38, 0.6],
  [0.6, 0.82],
  [0.82, 1],
] as const;

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const smooth = (from: number, to: number, value: number) => {
  const progress = clamp((value - from) / Math.max(to - from, 0.0001));
  return progress * progress * (3 - 2 * progress);
};

function actVisibility(progress: number, index: number) {
  const [start, end] = ACT_RANGES[index];
  const enter = start === 0 ? 1 : smooth(start, start + 0.045, progress);
  const exit = end === 1 ? 1 : 1 - smooth(end - 0.04, end, progress);
  return { enter, exit, visibility: enter * exit };
}

export function HeroScrollScene({ onBegin }: HeroScrollSceneProps) {
  const sceneRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    const stage = scene.querySelector<HTMLElement>("[data-stage]");
    const progressBar = scene.querySelector<HTMLElement>("[data-progress]");
    const actNodes = [...scene.querySelectorAll<HTMLElement>("[data-hero-act]")];
    const layerNodes = [...scene.querySelectorAll<HTMLElement>("[data-depth]")];
    const cardNodes = [...scene.querySelectorAll<HTMLElement>("[data-card-act]")];
    const core = scene.querySelector<HTMLElement>("[data-core]");
    const orbit = scene.querySelector<HTMLElement>("[data-orbit]");
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");

    let frame = 0;
    let progress = 0;
    let pointerX = 0;
    let pointerY = 0;
    let targetX = 0;
    let targetY = 0;

    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(render);
    };

    const render = () => {
      frame = 0;
      if (!stage || reduceMotion.matches) return;

      const rect = scene.getBoundingClientRect();
      const travel = Math.max(scene.offsetHeight - window.innerHeight, 1);
      progress = clamp(-rect.top / travel);
      pointerX += (targetX - pointerX) * 0.09;
      pointerY += (targetY - pointerY) * 0.09;

      if (progressBar) progressBar.style.transform = `scaleX(${Math.max(progress, 0.015)})`;

      layerNodes.forEach((node) => {
        const depth = Number(node.dataset.depth ?? 0);
        const scrollY = progress * depth * -28;
        const mouseX = finePointer.matches ? pointerX * depth * 4.5 : 0;
        const mouseY = finePointer.matches ? pointerY * depth * 2.6 : 0;
        const scale = 1.025 + progress * (0.025 + depth * 0.008);
        node.style.transform = `translate3d(${mouseX}px, ${scrollY + mouseY}px, 0) scale(${scale})`;
      });

      actNodes.forEach((node) => {
        const index = Number(node.dataset.heroAct ?? 0);
        const { enter, exit, visibility } = actVisibility(progress, index);
        const y = (1 - enter) * 30 - (1 - exit) * 22;
        node.style.opacity = visibility.toFixed(3);
        node.style.transform = `translate3d(0, ${y}px, 0)`;
        node.style.pointerEvents = index === 4 && visibility > 0.72 ? "auto" : "none";
        node.toggleAttribute("inert", visibility < 0.08);
        node.setAttribute("aria-hidden", visibility < 0.08 ? "true" : "false");
      });

      cardNodes.forEach((node) => {
        const index = Number(node.dataset.cardAct ?? 0);
        const rotate = Number(node.dataset.rotate ?? 0);
        const drift = Number(node.dataset.drift ?? 1);
        const { enter, exit, visibility } = actVisibility(progress, index);
        const x = (1 - enter) * 52 * drift - (1 - exit) * 34 * drift;
        const y = (1 - enter) * 40 + (1 - exit) * -24;
        const counterScale = (0.94 + visibility * 0.06) / (1 + progress * 0.045);
        node.style.opacity = visibility.toFixed(3);
        node.style.transform = `translate3d(${x}px, ${y}px, 0) rotate(${rotate * visibility}deg) scale(${counterScale})`;
      });

      if (core) {
        const coreScale = 0.96 + Math.sin(progress * Math.PI) * 0.08;
        core.style.transform = `translate3d(${pointerX * 5}px, ${pointerY * 4}px, 0) scale(${coreScale})`;
      }
      if (orbit) orbit.style.transform = `rotate(${progress * 96 - 18}deg)`;

      if (Math.abs(targetX - pointerX) > 0.002 || Math.abs(targetY - pointerY) > 0.002) schedule();
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!finePointer.matches) return;
      targetX = event.clientX / Math.max(window.innerWidth, 1) - 0.5;
      targetY = event.clientY / Math.max(window.innerHeight, 1) - 0.5;
      schedule();
    };
    const onPointerLeave = () => {
      targetX = 0;
      targetY = 0;
      schedule();
    };

    const onPreferenceChange = () => {
      if (reduceMotion.matches) {
        actNodes.forEach((node) => {
          node.style.removeProperty("opacity");
          node.style.removeProperty("transform");
          node.style.removeProperty("pointer-events");
          node.removeAttribute("inert");
          node.removeAttribute("aria-hidden");
        });
        [...layerNodes, ...cardNodes].forEach((node) => node.style.removeProperty("transform"));
        core?.style.removeProperty("transform");
        orbit?.style.removeProperty("transform");
      }
      schedule();
    };

    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule, { passive: true });
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", onPointerLeave);
    reduceMotion.addEventListener("change", onPreferenceChange);
    finePointer.addEventListener("change", schedule);
    schedule();

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("pointermove", onPointerMove);
      document.documentElement.removeEventListener("pointerleave", onPointerLeave);
      reduceMotion.removeEventListener("change", onPreferenceChange);
      finePointer.removeEventListener("change", schedule);
    };
  }, []);

  return (
    <section ref={sceneRef} className={styles.scene} aria-label="AIPPT 从一句话到专业演示的五幕工作流">
      <div className={styles.stage} data-stage>
        <div className={styles.backdrop} aria-hidden="true">
          <div className={`${styles.cityLayer} ${styles.sky}`} data-depth="0.16" />
          <div className={`${styles.cityLayer} ${styles.farCity}`} data-depth="0.28" />
          <div className={`${styles.cityLayer} ${styles.midCity}`} data-depth="0.44" />
          <div className={`${styles.cityLayer} ${styles.river}`} data-depth="0.62" />
          <div className={`${styles.cityLayer} ${styles.foreground}`} data-depth="0.85" />
          <div className={styles.grid} data-depth="0.38" />
          <div className={styles.glow} data-depth="0.22" />
        </div>

        <div className={styles.systemBar} aria-hidden="true">
          <span>AIPPT / PAZHOU 23.1136°N</span>
          <span className={styles.signal}><i /> SYSTEM ONLINE</span>
        </div>

        <div className={styles.progressTrack} aria-hidden="true">
          <i data-progress />
          <span>01</span><span>02</span><span>03</span><span>04</span><span>05</span>
        </div>

        <div className={styles.copyStack}>
          <article className={styles.actCopy} data-hero-act="0">
            <p className={styles.eyebrow}>ACT 01 / SIGNAL IN</p>
            <h1>从一句话，<br />到一份可交付的<span>专业演示</span></h1>
            <p>把你的目标说出来。页核从意图出发，而不是从空白页开始。</p>
          </article>

          <article className={styles.actCopy} data-hero-act="1">
            <p className={styles.eyebrow}>ACT 02 / UNDERSTAND</p>
            <h2>页核先理解目标，<br />再决定怎么讲。</h2>
            <p>听众、场景、边界和期望行动，被组织成一份可确认的创作简报。</p>
          </article>

          <article className={styles.actCopy} data-hero-act="2">
            <p className={styles.eyebrow}>ACT 03 / BLUEPRINT</p>
            <h2>把观点连成故事线，<br />把故事线拆成页面。</h2>
            <p>先确定主张、证据与节奏，再开始组织内容，每一页都有任务。</p>
          </article>

          <article className={styles.actCopy} data-hero-act="3">
            <p className={styles.eyebrow}>ACT 04 / COMPOSE</p>
            <h2>页面自动归位，<br />依然保持可编辑。</h2>
            <p>内容、版式、图表和视觉语言来自同一份蓝图，你可以继续精修。</p>
          </article>

          <article className={`${styles.actCopy} ${styles.finalCopy}`} data-hero-act="4">
            <p className={styles.eyebrow}>ACT 05 / DELIVER</p>
            <h2>检查、修正、交付。<br />让每一页经得起提问。</h2>
            <p>事实、引用、可读性与交付格式同步检查，就绪后一键导出。</p>
            <div className={styles.actions}>
              <a className={styles.primaryAction} href="/?view=create" onClick={onBegin}>免费创建演示 <span aria-hidden="true">↗</span></a>
              <a className={styles.secondaryAction} href="#cases">查看真实案例 <span aria-hidden="true">→</span></a>
            </div>
            <small>免费开始 · 无需绑定支付方式</small>
          </article>
        </div>

        <div className={styles.machine} aria-hidden="true">
          <div className={styles.orbit} data-orbit><i /><i /><i /><i /><i /></div>
          <div className={styles.core} data-core>
            <span>PAGE CORE</span>
            <img src="/generated/production/sage-sage-planning/sage-sage-planning.webp" alt="" />
            <b>页核</b>
          </div>

          <div className={`${styles.sceneCard} ${styles.promptCard}`} data-card-act="0" data-rotate="-3" data-drift="-1">
            <span>ORIGINAL SIGNAL / 01</span>
            <p>为董事会做一份 Q3 增长复盘，重点说清净收入留存与下一季度行动。</p>
            <i className={styles.cursor} />
          </div>

          <div className={`${styles.sceneCard} ${styles.intentCard}`} data-card-act="1" data-rotate="3" data-drift="1">
            <span>INTENT MAP / VERIFIED</span>
            <div className={styles.intentRows}>
              <p><i>GOAL</i><b>对齐增长判断</b></p>
              <p><i>AUDIENCE</i><b>董事会 / 管理层</b></p>
              <p><i>ACTION</i><b>确认 Q4 资源配置</b></p>
            </div>
          </div>

          <div className={`${styles.sceneCard} ${styles.blueprintCard}`} data-card-act="2" data-rotate="-2" data-drift="-1">
            <span>STORY BLUEPRINT / 06 PAGES</span>
            <div className={styles.blueprintFlow}>
              <p><i>01</i><b>核心结论</b><em /></p>
              <p><i>02</i><b>数据现状</b><em /></p>
              <p><i>03</i><b>关键归因</b><em /></p>
              <p><i>04</i><b>行动路径</b></p>
            </div>
          </div>

          <div className={`${styles.deckCluster} ${styles.deckCard}`} data-card-act="3" data-rotate="2" data-drift="1">
            <div className={styles.slide}><span>01 / SIGNAL</span><strong>增长，来自更高质量的留存</strong><i /></div>
            <div className={styles.slide}><span>02 / EVIDENCE</span><strong>NRR</strong><b>112%</b><i /></div>
            <div className={styles.slide}><span>03 / SYSTEM</span><strong>三个确定性</strong><em /><em /><em /></div>
            <div className={styles.slide}><span>04 / ACTION</span><strong>90 天行动路径</strong><i /></div>
          </div>

          <div className={`${styles.sceneCard} ${styles.deliveryCard}`} data-card-act="4" data-rotate="0" data-drift="-1">
            <span>QUALITY & DELIVERY / READY</span>
            <div className={styles.score}><b>92</b><i>/ 100</i><em>可交付</em></div>
            <ul><li>结构完整</li><li>引用可追溯</li><li>可读性通过</li></ul>
            <div className={styles.formats}><b>PPTX</b><b>PDF</b><b>PNG</b></div>
          </div>
        </div>

        <div className={styles.scrollHint} aria-hidden="true"><i /> SCROLL TO COMPOSE</div>
        <div className={styles.softExit} aria-hidden="true" />
      </div>
    </section>
  );
}

export default HeroScrollScene;
