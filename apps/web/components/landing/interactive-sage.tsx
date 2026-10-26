"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import styles from "./interactive-sage.module.css";

const sageStates = [
  {
    id: "listening",
    step: "01",
    label: "听清需求",
    eyebrow: "SIGNAL IN",
    title: "先把要讲的事听明白",
    description: "确认主题、听众、使用场景，以及这次演示真正需要推动的结果。",
  },
  {
    id: "planning",
    step: "02",
    label: "规划结构",
    eyebrow: "BLUEPRINT",
    title: "把零散信息排成叙事",
    description: "提炼主张、章节和论据，让每一页都服务于同一条表达路径。",
  },
  {
    id: "researching",
    step: "03",
    label: "梳理材料",
    eyebrow: "EVIDENCE",
    title: "让事实与观点各就各位",
    description: "识别材料中的关键证据、缺口与引用风险，避免页面只剩漂亮口号。",
  },
  {
    id: "composing",
    step: "04",
    label: "组织页面",
    eyebrow: "COMPOSE",
    title: "把结构转成可编辑页面",
    description: "匹配版式、图文层级和视觉节奏，并保留继续精修的空间。",
  },
  {
    id: "checking",
    step: "05",
    label: "核对风险",
    eyebrow: "QUALITY",
    title: "交付前再做一次复核",
    description: "检查事实、版权、格式与内容完整度，把问题留在演示之前解决。",
  },
  {
    id: "success",
    step: "06",
    label: "准备交付",
    eyebrow: "DELIVERY",
    title: "让结果进入真实使用场景",
    description: "在同一项目中完成导出、分享与版本留存，刷新后仍能继续工作。",
  },
] as const;

type SageStateId = (typeof sageStates)[number]["id"];

export type InteractiveSageProps = {
  id?: string;
  className?: string;
};

export default function InteractiveSage({ id = "sage", className = "" }: InteractiveSageProps) {
  const [selectedId, setSelectedId] = useState<SageStateId>("listening");
  const [previewId, setPreviewId] = useState<SageStateId | null>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const displayedId = previewId ?? selectedId;
  const displayed = sageStates.find((state) => state.id === displayedId) ?? sageStates[0];

  const selectByIndex = (index: number) => {
    const nextIndex = (index + sageStates.length) % sageStates.length;
    const next = sageStates[nextIndex];
    setSelectedId(next.id);
    setPreviewId(null);
    tabRefs.current[nextIndex]?.focus();
  };

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      selectByIndex(index + 1);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      selectByIndex(index - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      selectByIndex(0);
    } else if (event.key === "End") {
      event.preventDefault();
      selectByIndex(sageStates.length - 1);
    }
  };

  return (
    <section id={id} className={`${styles.section} ${className}`.trim()} aria-labelledby={`${id}-title`}>
      <div className={styles.grid} aria-hidden="true" />
      <div className={styles.intro}>
        <p className={styles.kicker}><span /> PAGE CORE / LIVE COLLABORATION</p>
        <h2 id={`${id}-title`}>页核不是一个按钮<br />而是一位全程在场的演示搭档</h2>
        <p className={styles.lead}>从听清需求到准备交付，页核会根据任务阶段切换工作状态。把鼠标移到状态上，或点击选择，看看它如何参与一份演示。</p>
        <div className={styles.signal} aria-label="页核连接状态">
          <i aria-hidden="true" />
          <span>PAGE CORE ONLINE</span>
          <b>6 个协作阶段</b>
        </div>
      </div>

      <div className={styles.stage}>
        <div className={styles.visual}>
          <span className={styles.orbit} aria-hidden="true" />
          <span className={styles.scanline} aria-hidden="true" />
          <span className={styles.coordinates} aria-hidden="true">PAZHOU / 23.1136°N</span>
          <span className={styles.stateIndex} aria-hidden="true">{displayed.step} / 06</span>
          <div className={styles.imageFrame}>
            <img
              key={displayed.id}
              className={styles.sage}
              src={`/generated/production/sage-sage-${displayed.id}/sage-sage-${displayed.id}-512.png`}
              alt={`页核正在${displayed.label}`}
            />
          </div>
          <span className={styles.shadow} aria-hidden="true" />
        </div>

        <div
          id={`${id}-panel-${displayed.id}`}
          className={styles.stateCopy}
          role="tabpanel"
          aria-live="polite"
        >
          <p>{displayed.eyebrow} / {displayed.step}</p>
          <h3>{displayed.title}</h3>
          <span>{displayed.description}</span>
        </div>
      </div>

      <div className={styles.tabs} role="tablist" aria-label="切换页核协作状态">
        {sageStates.map((state, index) => {
          const selected = selectedId === state.id;
          const displayedNow = displayedId === state.id;
          return (
            <button
              key={state.id}
              ref={(node) => { tabRefs.current[index] = node; }}
              type="button"
              role="tab"
              tabIndex={selected ? 0 : -1}
              aria-selected={selected}
              aria-controls={`${id}-panel-${state.id}`}
              className={`${styles.tab} ${displayedNow ? styles.tabActive : ""}`.trim()}
              onClick={() => { setSelectedId(state.id); setPreviewId(null); }}
              onPointerEnter={() => setPreviewId(state.id)}
              onPointerLeave={() => setPreviewId(null)}
              onFocus={() => setPreviewId(state.id)}
              onBlur={() => setPreviewId(null)}
              onKeyDown={(event) => handleTabKeyDown(event, index)}
            >
              <span className={styles.thumb} aria-hidden="true">
                <img src={`/generated/production/sage-sage-${state.id}/sage-sage-${state.id}-128.png`} alt="" />
              </span>
              <span className={styles.tabCopy}>
                <small>{state.step} / {state.eyebrow}</small>
                <b>{state.label}</b>
              </span>
              <i aria-hidden="true" />
            </button>
          );
        })}
      </div>
    </section>
  );
}
