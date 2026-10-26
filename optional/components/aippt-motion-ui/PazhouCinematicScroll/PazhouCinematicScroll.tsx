'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { PAZHOU_CINEMATIC_SCROLL_PX, PAZHOU_MOTION, PAZHOU_SCENES } from './motionConfig';
import './PazhouCinematicScroll.css';

export interface PazhouGalleryItem {
  image: string;
  title: string;
  kind: 'template' | 'skill' | 'case';
  href?: string;
}

export interface PazhouCinematicAssets {
  sky: string;
  farCity: string;
  river: string;
  midCity: string;
  foreground: string;
  pageCoreSage: string;
  sourceDocuments?: string;
  generatedSlides?: string;
  irCore?: string;
  editorPreview?: string;
}

export interface PazhouCinematicScrollProps {
  assets: PazhouCinematicAssets;
  galleryItems: PazhouGalleryItem[];
  onStart?: () => void;
  onViewCase?: () => void;
  className?: string;
}

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smoothstep = (e0: number, e1: number, value: number) => {
  if (e0 === e1) return value >= e1 ? 1 : 0;
  const x = clamp((value - e0) / (e1 - e0));
  return x * x * (3 - 2 * x);
};
const segment = (scroll: number, scene: { enter: number; settle: number; exitStart: number; exitEnd: number }) => {
  const enter = smoothstep(scene.enter, scene.settle, scroll);
  const exit = smoothstep(scene.exitStart, scene.exitEnd, scroll);
  return { enter, exit, active: enter * (1 - exit) };
};

const setVar = (root: HTMLElement, name: string, value: string | number) => {
  root.style.setProperty(name, typeof value === 'number' ? value.toFixed(4) : value);
};

export default function PazhouCinematicScroll({
  assets,
  galleryItems,
  onStart,
  onViewCase,
  className = '',
}: PazhouCinematicScrollProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const visibleRef = useRef(true);
  const initializedRef = useRef(false);
  const targetScrollRef = useRef(0);
  const smoothScrollRef = useRef(0);
  const targetPointerRef = useRef({ x: 0, y: 0 });
  const pointerRef = useRef({ x: 0, y: 0 });

  const reduceMotion = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
    []
  );

  const getScrollDistance = useCallback(() => {
    const section = sectionRef.current;
    if (!section) return 0;
    return clamp(
      -section.getBoundingClientRect().top,
      0,
      Math.max(0, section.offsetHeight - window.innerHeight)
    );
  }, []);

  const requestTick = useCallback(() => {
    if (rafRef.current == null && visibleRef.current) {
      rafRef.current = window.requestAnimationFrame(update);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const update = useCallback(() => {
    rafRef.current = null;
    const root = rootRef.current;
    if (!root || !visibleRef.current) return;

    targetScrollRef.current = getScrollDistance();

    if (!initializedRef.current || reduceMotion) {
      smoothScrollRef.current = targetScrollRef.current;
      initializedRef.current = true;
    } else {
      smoothScrollRef.current = lerp(
        smoothScrollRef.current,
        targetScrollRef.current,
        PAZHOU_MOTION.scrollLerp
      );
    }

    const smoothScroll = smoothScrollRef.current;
    const targetScroll = targetScrollRef.current;
    if (Math.abs(smoothScroll - targetScroll) < 0.08) smoothScrollRef.current = targetScroll;

    const pointer = pointerRef.current;
    const targetPointer = targetPointerRef.current;
    pointer.x = reduceMotion ? 0 : lerp(pointer.x, targetPointer.x, PAZHOU_MOTION.pointerLerp);
    pointer.y = reduceMotion ? 0 : lerp(pointer.y, targetPointer.y, PAZHOU_MOTION.pointerLerp);

    const opening = segment(smoothScroll, PAZHOU_SCENES.opening);
    const ingestion = segment(smoothScroll, PAZHOU_SCENES.ingestion);
    const orchestration = segment(smoothScroll, PAZHOU_SCENES.orchestration);
    const outputs = segment(smoothScroll, PAZHOU_SCENES.outputs);
    const gallery = segment(smoothScroll, PAZHOU_SCENES.gallery);
    const product = segment(smoothScroll, PAZHOU_SCENES.product);

    const globalProgress = clamp(smoothScroll / PAZHOU_CINEMATIC_SCROLL_PX);
    const worldScale =
      1 +
      globalProgress * 0.08 +
      ingestion.enter * 0.04 +
      orchestration.enter * 0.04 +
      outputs.enter * 0.03;

    const focusBlur = clamp(ingestion.active + orchestration.active + outputs.active);
    const sourceEnter = ingestion.enter * (1 - ingestion.exit);
    const orchestrationActive = orchestration.active;
    const outputActive = outputs.active;
    const galleryEnter = Math.pow(gallery.enter, 1.45);
    const productEnter = product.enter;

    setVar(root, '--mx', pointer.x);
    setVar(root, '--my', pointer.y);
    setVar(root, '--scroll', smoothScroll);
    setVar(root, '--opening', opening.active);
    setVar(root, '--ingestion', ingestion.active);
    setVar(root, '--orchestration', orchestration.active);
    setVar(root, '--outputs', outputs.active);
    setVar(root, '--gallery', gallery.active);
    setVar(root, '--product', product.active);

    setVar(root, '--world-scale', worldScale);
    setVar(root, '--world-x', `${pointer.x * -PAZHOU_MOTION.pointerWorldX}px`);
    setVar(root, '--world-y', `${pointer.y * -PAZHOU_MOTION.pointerWorldY - globalProgress * 48}px`);
    setVar(root, '--scene-blur', `${focusBlur * PAZHOU_MOTION.maxBlurPx}px`);
    setVar(root, '--scene-brightness', 1 - focusBlur * 0.24);
    setVar(root, '--shade-opacity', clamp(focusBlur * 0.78 + gallery.active * 0.22));

    setVar(root, '--hero-y', `${opening.exit * -160}px`);
    setVar(root, '--hero-opacity', 1 - opening.exit);
    setVar(root, '--hero-scale', 1 - opening.exit * 0.06);

    setVar(root, '--source-left-x', `${(1 - sourceEnter) * -PAZHOU_MOTION.sourceTravelVw}vw`);
    setVar(root, '--source-right-x', `${(1 - sourceEnter) * PAZHOU_MOTION.sourceTravelVw}vw`);
    setVar(root, '--source-opacity', sourceEnter);

    setVar(
      root,
      '--agent-x',
      `calc(-50% + ${pointer.x * PAZHOU_MOTION.pointerAgentX}px)`
    );
    setVar(
      root,
      '--agent-y',
      `calc(-50% + ${pointer.y * PAZHOU_MOTION.pointerAgentY - orchestration.exit * 120}px)`
    );
    setVar(root, '--agent-scale', 0.78 + orchestration.enter * 0.28 + outputActive * 0.04);
    setVar(root, '--agent-opacity', clamp(ingestion.enter + orchestration.active + outputs.active));

    setVar(root, '--blueprint-opacity', orchestrationActive);
    setVar(root, '--blueprint-scale', 0.88 + orchestration.enter * 0.12);

    setVar(root, '--ir-opacity', outputActive);
    setVar(root, '--output-spread', `${outputActive * PAZHOU_MOTION.outputSpreadVw}vw`);
    setVar(root, '--output-scale', 0.82 + outputActive * 0.18);

    setVar(root, '--gallery-opacity', galleryEnter);
    setVar(root, '--gallery-enter-x', `${(1 - galleryEnter) * PAZHOU_MOTION.galleryEnterVw}vw`);
    setVar(root, '--gallery-scale', 0.92 + galleryEnter * 0.08);

    setVar(root, '--editor-opacity', productEnter);
    setVar(root, '--editor-scale', 0.82 + productEnter * 0.18);
    setVar(root, '--editor-y', `${(1 - productEnter) * 84}px`);

    const needsAnotherFrame =
      Math.abs(smoothScrollRef.current - targetScrollRef.current) > 0.08 ||
      Math.abs(pointer.x - targetPointer.x) > 0.001 ||
      Math.abs(pointer.y - targetPointer.y) > 0.001;

    if (needsAnotherFrame) requestTick();
  }, [getScrollDistance, reduceMotion, requestTick]);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    const onScroll = () => requestTick();
    const onResize = () => requestTick();
    const onPointerMove = (event: PointerEvent) => {
      targetPointerRef.current = {
        x: event.clientX / window.innerWidth - 0.5,
        y: event.clientY / window.innerHeight - 0.5,
      };
      requestTick();
    };
    const onVisibilityChange = () => {
      visibleRef.current = !document.hidden;
      if (visibleRef.current) requestTick();
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        visibleRef.current = entry.isIntersecting && !document.hidden;
        if (visibleRef.current) requestTick();
      },
      { rootMargin: '200px 0px' }
    );
    observer.observe(section);

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    document.addEventListener('visibilitychange', onVisibilityChange);
    requestTick();

    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [requestTick]);

  return (
    <section
      ref={sectionRef}
      className={`pazhou-cinema ${className}`}
      style={{ '--pazhou-scroll-px': `${PAZHOU_CINEMATIC_SCROLL_PX}px` } as React.CSSProperties}
      aria-label="AIPPT 琶洲电影式产品故事"
    >
      <a className="pazhou-cinema__skip" href="#aippt-landing-content">
        跳过动态开场
      </a>

      <div ref={rootRef} className="pazhou-cinema__stage">
        <div className="pazhou-cinema__world" aria-hidden="true">
          <img className="pazhou-cinema__layer pazhou-cinema__sky" src={assets.sky} alt="" />
          <img className="pazhou-cinema__layer pazhou-cinema__far-city" src={assets.farCity} alt="" />
          <img className="pazhou-cinema__layer pazhou-cinema__river" src={assets.river} alt="" />
          <img className="pazhou-cinema__layer pazhou-cinema__mid-city" src={assets.midCity} alt="" />
          <img className="pazhou-cinema__layer pazhou-cinema__foreground" src={assets.foreground} alt="" />
          <div className="pazhou-cinema__shade" />
        </div>

        <header className="pazhou-cinema__hero">
          <p className="pazhou-cinema__eyebrow">AIPPT · AI PRESENTATION OS</p>
          <h1>从资料到演示，让智能体为你完成。</h1>
          <p>理解目标、编排内容、调用 Skills、检查质量，生成真正可编辑的专业演示。</p>
          <div className="pazhou-cinema__hero-actions">
            <button onClick={onStart}>让智能体开始创作</button>
            <button onClick={onViewCase}>查看真实案例</button>
          </div>
          <ul aria-label="支持的演示输出">
            <li>PPTX</li><li>HTML</li><li>图片</li><li>自由画布</li>
          </ul>
        </header>

        <section className="pazhou-cinema__scene pazhou-cinema__scene--ingestion" aria-label="资料进入系统">
          <div className="pazhou-cinema__source pazhou-cinema__source--left">
            <span>Word</span><span>PDF</span><span>Excel</span>
          </div>
          <div className="pazhou-cinema__source pazhou-cinema__source--right">
            <span>旧 PPT</span><span>网页</span><span>品牌资料</span>
          </div>
          <div className="pazhou-cinema__scene-copy">
            <span>02</span>
            <h2>你的资料，就是创作起点。</h2>
            <p>智能体会解析内容、保留来源，识别数据、图片、品牌和必须锁定的信息。</p>
          </div>
        </section>

        <section className="pazhou-cinema__scene pazhou-cinema__scene--orchestration" aria-label="智能体策划与编排">
          <img className="pazhou-cinema__agent" src={assets.pageCoreSage} alt="Page Core Sage 智能体" />
          <div className="pazhou-cinema__blueprint">
            <h2>理解、规划、编排、检查。</h2>
            <ol>
              <li>理解目标与听众</li>
              <li>构建演示蓝图</li>
              <li>匹配模板与 Skills</li>
              <li>生成内容与图表</li>
              <li>执行质量与兼容检查</li>
            </ol>
          </div>
        </section>

        <section className="pazhou-cinema__scene pazhou-cinema__scene--outputs" aria-label="多格式交付">
          <div className="pazhou-cinema__ir-core">Presentation IR</div>
          {['PPTX', 'HTML', '图片', '自由画布'].map((label, index) => (
            <div key={label} className={`pazhou-cinema__output pazhou-cinema__output--${index + 1}`}>
              <span>{label}</span>
            </div>
          ))}
          <div className="pazhou-cinema__scene-copy">
            <span>04</span>
            <h2>一份内容，多种交付。</h2>
            <p>共享逻辑内容，针对每种输出独立排版，不用为不同渠道重新制作。</p>
          </div>
        </section>

        <section className="pazhou-cinema__scene pazhou-cinema__scene--gallery" aria-label="模板与 Skills">
          <div className="pazhou-cinema__gallery-track">
            {galleryItems.map((item) => (
              <a key={`${item.kind}-${item.title}`} href={item.href ?? '#aippt-landing-content'}>
                <img src={item.image} alt="" />
                <span>{item.title}</span>
                <small>{item.kind}</small>
              </a>
            ))}
          </div>
          <div className="pazhou-cinema__scene-copy">
            <span>05</span>
            <h2>专业模板与 Skills，随取随用。</h2>
          </div>
        </section>

        <section className="pazhou-cinema__scene pazhou-cinema__scene--product" aria-label="进入 AIPPT 产品">
          <div className="pazhou-cinema__editor-frame">
            <img src={assets.editorPreview ?? ''} alt="AIPPT 在线编辑器预览" />
          </div>
          <img className="pazhou-cinema__agent pazhou-cinema__agent--product" src={assets.pageCoreSage} alt="" />
          <div className="pazhou-cinema__scene-copy">
            <span>06</span>
            <h2>进入工作台，完成真正可交付的演示。</h2>
            <button onClick={onStart}>立即开始创作</button>
          </div>
        </section>
      </div>
    </section>
  );
}
