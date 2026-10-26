"use client";

import { ArrowRight, Check, ChevronDown, Sparkles } from "lucide-react";
import { marketingContent } from "../../content/marketing";
import styles from "./marketing-sections.module.css";

type MarketingSectionsProps = {
  onBegin: () => void;
  onProjects: () => void;
};

export function MarketingSections({ onBegin, onProjects }: MarketingSectionsProps) {
  const content = marketingContent;

  return (
    <div className={styles.sections}>
      <section className={styles.bridge} aria-label="从首页叙事进入产品工作方式">
        <div className={styles.bridgeLine} aria-hidden="true" />
        <p>需求已经进入页核</p>
        <span>下面用真实产品结构说明，它如何继续成为可以修改和交付的页面。</span>
      </section>

      <section className={styles.problemSection} aria-labelledby="problem-title">
        <header className={styles.sectionHeading}>
          <p>{content.problem.eyebrow}</p>
          <h2 id="problem-title">{content.problem.title}</h2>
          <span>{content.problem.body}</span>
        </header>
        <div className={styles.problemList}>
          {content.problem.items.map(([label, answer], index) => (
            <article key={label}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <h3>{label}</h3>
              <p>{answer}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.positionBand} aria-labelledby="position-title">
        <div className={styles.positionCopy}>
          <p>{content.position.eyebrow}</p>
          <h2 id="position-title">{content.position.title}</h2>
          <span>{content.position.body}</span>
        </div>
        <div className={styles.positionChain} aria-label="AIPPT 连续工作流程">
          {content.position.chain.map((item, index) => (
            <span key={item}><i>{String(index + 1).padStart(2, "0")}</i>{item}</span>
          ))}
        </div>
      </section>

      <section id="workflow" className={styles.workflow} aria-labelledby="workflow-title">
        <header className={styles.sectionHeading}>
          <p>{content.workflow.eyebrow}</p>
          <h2 id="workflow-title">{content.workflow.title}</h2>
          <span>{content.workflow.body}</span>
        </header>
        <div className={styles.workflowSteps}>
          {content.hero.acts.map((act, index) => (
            <article key={act.code} className={styles.workflowStep}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <div className={styles.stepSignal} aria-hidden="true" />
              <h3>{content.position.chain[index]}</h3>
              <p>{act.body}</p>
              <div className={styles.stepEvidence}>{act.evidence.map((item) => <i key={item}>{item}</i>)}</div>
            </article>
          ))}
        </div>
      </section>

      <section id="output" className={styles.outputSection} aria-labelledby="output-title">
        <header className={styles.outputHeading}>
          <p>{content.output.eyebrow}</p>
          <h2 id="output-title">{content.output.title}</h2>
          <span>{content.output.body}</span>
        </header>
        <div className={styles.outputWorkbench} aria-label="AIPPT 页面系统界面示意">
          <div className={styles.outputRail}>
            {content.output.pages.map((page, index) => (
              <button type="button" key={page} onClick={onBegin} aria-label={`用${page}结构开始创建`}>
                <i>{String(index + 1).padStart(2, "0")}</i><span>{page}</span>
              </button>
            ))}
          </div>
          <div className={styles.outputCanvas}>
            <small>PAGE 01 / 核心判断</small>
            <strong>先讲清结论，<br />再让证据接上来。</strong>
            <div className={styles.outputChart} aria-hidden="true"><i /><i /><i /><i /><i /></div>
            <p>页面示意用于展示信息层级与版式系统，不代表任何客户项目或实际经营数据。</p>
          </div>
          <aside className={styles.outputInspector}>
            <span>页面任务</span><b>建立核心判断</b>
            <span>内容状态</span><b>等待资料确认</b>
            <span>下一步</span><b>补充证据来源</b>
          </aside>
        </div>
      </section>

      <section className={styles.controlBand} aria-labelledby="control-title">
        <div className={styles.controlDemo} aria-label="当前页面 AI 修改示意">
          <span>CURRENT PAGE / AI 修改</span>
          <blockquote>{content.control.instruction}</blockquote>
          <div className={styles.changeList}>
            {content.control.changes.map((change) => <p key={change}><Check size={14} />{change}</p>)}
          </div>
          <small>修改范围：当前页</small>
        </div>
        <div className={styles.templateCopy}>
          <p>{content.control.eyebrow}</p>
          <h2 id="control-title">{content.control.title}</h2>
          <span className={styles.sectionBody}>{content.control.body}</span>
          <button className={styles.primaryAction} type="button" onClick={onBegin}>带着需求开始 <ArrowRight size={17} /></button>
        </div>
      </section>

      <section id="scenarios" className={styles.scenarioSection} aria-labelledby="scenarios-title">
        <header className={styles.sectionHeading}>
          <p>{content.scenarios.eyebrow}</p>
          <h2 id="scenarios-title">{content.scenarios.title}</h2>
        </header>
        <div className={styles.scenarioGrid}>
          {content.scenarios.items.map(([task, audience, result], index) => (
            <article key={task}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <h3>{task}</h3>
              <p><i>讲给谁</i>{audience}</p>
              <p><i>讲清什么</i>{result}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="trust" className={styles.trustSection} aria-labelledby="trust-title">
        <div className={styles.trustSignal} aria-hidden="true"><span /><span /><span /></div>
        <div className={styles.trustText}>
          <p>{content.trust.eyebrow}</p>
          <h2 id="trust-title">{content.trust.title}</h2>
          <span>{content.trust.body}</span>
        </div>
        <ul>{content.trust.items.map((item) => <li key={item}><Check size={14} />{item}</li>)}</ul>
        <button type="button" onClick={onProjects}>进入项目工作台 <ArrowRight size={16} /></button>
      </section>

      <section id="pricing" className={styles.pricingBand} aria-labelledby="pricing-title">
        <div className={styles.pricingIntro}>
          <p>{content.pricing.eyebrow}</p>
          <h2 id="pricing-title">{content.pricing.title}</h2>
          <span>{content.pricing.body}</span>
        </div>
        <div className={styles.planCards}>
          <article className={styles.freePlan}>
            <div><p>FREE</p><h3>¥0</h3><span>从第一份演示开始</span></div>
            <ul>{content.pricing.free.map((item) => <li key={item}>{item}</li>)}</ul>
            <button type="button" onClick={onBegin}>开始创建 <ArrowRight size={16} /></button>
          </article>
          <article className={styles.proPlan}>
            <div><p>PRO <Sparkles size={14} /></p><h3>¥29<span>/ 月</span></h3><span>需要更高上限与无品牌交付时</span></div>
            <ul>{content.pricing.pro.map((item) => <li key={item}>{item}</li>)}</ul>
            <a href="/pricing">查看 Pro 与年付 <ArrowRight size={16} /></a>
          </article>
        </div>
      </section>

      <section id="faq" className={styles.faq} aria-labelledby="faq-title">
        <header className={styles.sectionHeading}>
          <p>{content.faq.eyebrow}</p>
          <h2 id="faq-title">{content.faq.title}</h2>
        </header>
        <div className={styles.faqList}>
          {content.faq.items.map(([question, answer]) => (
            <details key={question}>
              <summary>{question}<ChevronDown size={18} aria-hidden="true" /></summary>
              <p>{answer}</p>
            </details>
          ))}
        </div>
      </section>

      <section className={styles.finalCta} aria-labelledby="final-cta-title">
        <p>{content.finalCta.eyebrow}</p>
        <h2 id="final-cta-title">{content.finalCta.title}</h2>
        <span>{content.finalCta.body}</span>
        <div>
          <button className={styles.primaryAction} type="button" onClick={onBegin}>{content.finalCta.primary} <ArrowRight size={17} /></button>
          <button className={styles.secondaryCta} type="button" onClick={onProjects}>{content.finalCta.secondary}</button>
        </div>
      </section>

      <footer className={styles.footer}>
        <div className={styles.footerBrand}>
          <img src="/observatory/aippt-orbit-mark-64.png" alt="" />
          <span>AIPPT</span>
          <p>{content.footer.claim}</p>
        </div>
        <nav aria-label="页脚导航">
          <a href="#workflow">工作方式</a>
          <a href="#output">页面示例</a>
          <a href="#trust">能力边界</a>
          <a href="/pricing">定价</a>
          <button type="button" onClick={onProjects}>项目工作台</button>
        </nav>
        <div className={styles.legal}><span>© {new Date().getFullYear()} {content.footer.copyright}</span></div>
      </footer>
    </div>
  );
}
