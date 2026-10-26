import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Download,
  FileImage,
  FileSpreadsheet,
  FileText,
  Globe2,
  ImageIcon,
  LayoutTemplate,
  MousePointer2,
  PanelsTopLeft,
  Presentation,
  Redo2,
  Search,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Undo2,
  UploadCloud,
  Waves,
  Waypoints,
  Workflow,
} from "lucide-react";
import {
  directions,
  informationArchitecture,
  type DirectionId,
  type DirectionSpec,
} from "./directions";
import styles from "./visual-directions.module.css";

const moduleDescriptions = {
  desktopHero: "同一产品承诺，不同叙事入口。双 CTA 与四种交付形式在首屏内完整可见。",
  mobileHero: "移动端重新构图，不缩小桌面画面，不依赖 hover，也不添加设备外框。",
  create: "以目标和真实资料为起点，五种创建入口共享同一任务语境。",
  agent: "展示可理解的真实工作步骤，不使用随机终端代码模拟智能过程。",
  editor: "保留顶部操作、左侧页面、中央画布、右侧属性与智能体、底部状态五区。",
  templates: "模板预览来自真实 16:9 页面结构，Skills 对应可解释的生产任务。",
  brand: "临时代号只用于比较，符号保持开放，不绑定最终产品名称。",
  ip: "IP 负责表达状态和调度，不承担幼态陪伴或装饰角色。",
  visual: "色彩、字体、材质和摄影共同构成方向，不靠换主题色制造差异。",
  motion: "每段动效解释资料如何进入、被编排、检查并交付。Reduced Motion 保持静态叙事。",
  slide: "三套方向使用同一页真实内容，便于比较信息层级和模板适配能力。",
} as const;

function DirectionMark({ id, size = 28 }: { id: DirectionId; size?: number }) {
  const Icon = id === "a" ? Waves : id === "b" ? PanelsTopLeft : Waypoints;
  return <Icon aria-hidden="true" size={size} strokeWidth={1.7} />;
}

function DirectionNav({ current }: { current?: DirectionId }) {
  return (
    <nav className={styles.reviewNav} aria-label="视觉方向评审导航">
      <Link className={styles.reviewBrand} href="/visual-directions">
        <span className={styles.reviewBrandMark}>AI</span>
        <span>AIPPT 视觉方向评审</span>
      </Link>
      <div className={styles.directionLinks}>
        {directions.map((direction) => (
          <Link
            aria-current={current === direction.id ? "page" : undefined}
            className={current === direction.id ? styles.activeDirectionLink : undefined}
            href={`/visual-directions?direction=${direction.id}`}
            key={direction.id}
          >
            {direction.id.toUpperCase()} {direction.codeNameCn}
          </Link>
        ))}
      </div>
    </nav>
  );
}

function CostLabel({ cost }: { cost: string }) {
  return <span className={styles.costLabel}>最终实现成本 {cost}</span>;
}

export function DirectionOverview() {
  return (
    <main className={styles.overviewRoot}>
      <DirectionNav />
      <header className={styles.overviewIntro}>
        <p className={styles.kicker}>三套原创方向，同一产品事实</p>
        <h1>先决定 AIPPT 应该被怎样记住。</h1>
        <p>
          A 强调城市与算法编排，B 强调编辑与专业交付，C 强调智能体调度与系统能力。正式产品页面尚未改动。
        </p>
      </header>

      <section className={styles.overviewGrid} aria-label="三套视觉方向">
        {directions.map((direction) => (
          <article
            className={`${styles.overviewCard} ${styles[`overviewCard_${direction.id}`]}`}
            key={direction.id}
          >
            <div className={styles.overviewImage}>
              <Image
                alt={direction.imageAlt}
                fill
                priority={direction.id === "a"}
                sizes={direction.id === "a" ? "(max-width: 900px) 100vw, 66vw" : "(max-width: 900px) 100vw, 34vw"}
                src={direction.masterImage}
              />
            </div>
            <div className={styles.overviewCardCopy}>
              <div className={styles.overviewMark}>
                <DirectionMark id={direction.id} />
              </div>
              <div>
                <span className={styles.directionLetter}>{direction.id.toUpperCase()}</span>
                <h2>{direction.title}</h2>
                <p>{direction.thesis}</p>
              </div>
              <div className={styles.overviewMeta}>
                <span>{direction.codeNameCn} / {direction.codeNameEn}</span>
                <CostLabel cost={direction.cost} />
              </div>
              <Link className={styles.overviewAction} href={`/visual-directions?direction=${direction.id}`}>
                查看完整方向
                <ArrowRight aria-hidden="true" size={18} />
              </Link>
            </div>
          </article>
        ))}
      </section>

      <section className={styles.comparisonSection}>
        <div className={styles.sectionHeadingSimple}>
          <h2>比较基准</h2>
          <p>所有方向使用相同内容和工作流，只比较构图、品牌、IP、材质、密度与动效语言。</p>
        </div>
        <div className={styles.tableWrap}>
          <table>
            <thead>
              <tr>
                <th>方向</th>
                <th>最强表达</th>
                <th>主要风险</th>
                <th>营销强度</th>
                <th>产品强度</th>
              </tr>
            </thead>
            <tbody>
              {directions.map((direction) => (
                <tr key={direction.id}>
                  <th>{direction.id.toUpperCase()} {direction.title}</th>
                  <td>{direction.strength}</td>
                  <td>{direction.risk}</td>
                  <td>{direction.marketingDials}</td>
                  <td>{direction.productDials}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

function ModuleHeader({ title, description }: { title: string; description: string }) {
  return (
    <header className={styles.moduleHeader}>
      <h2>{title}</h2>
      <p>{description}</p>
    </header>
  );
}

function BoardModule({
  dataModule,
  title,
  description,
  children,
  id,
}: {
  dataModule: string;
  title: string;
  description: string;
  children: React.ReactNode;
  id?: string;
}) {
  return (
    <section className={styles.boardModule} data-module={dataModule} id={id}>
      <ModuleHeader description={description} title={title} />
      {children}
    </section>
  );
}

function BrandLockup({ direction, compact = false }: { direction: DirectionSpec; compact?: boolean }) {
  return (
    <span className={`${styles.brandLockup} ${compact ? styles.brandLockupCompact : ""}`}>
      <span className={styles.brandMark}>
        <DirectionMark id={direction.id} size={compact ? 17 : 24} />
      </span>
      <span>
        <strong>{direction.codeNameCn}</strong>
        {!compact && <small>{direction.codeNameEn}</small>}
      </span>
    </span>
  );
}

function HeroActions() {
  return (
    <div className={styles.heroActions}>
      <a className={styles.primaryAction} href="#create-center">
        让智能体开始创作
        <ArrowRight aria-hidden="true" size={17} />
      </a>
      <a className={styles.secondaryAction} href="#ppt-sample">
        查看真实生成案例
      </a>
    </div>
  );
}

function DeliveryFormats() {
  return (
    <div className={styles.deliveryFormats} aria-label="支持的演示形式">
      <span>可编辑 PPTX</span>
      <span>网页演示</span>
      <span>高清图片</span>
      <span>自由画布</span>
    </div>
  );
}

function DesktopHero({ direction }: { direction: DirectionSpec }) {
  return (
    <div className={`${styles.desktopScreen} ${styles[`desktopHero_${direction.id}`]}`} data-export="desktop-hero" id="export-desktop-hero">
      <Image
        alt={direction.imageAlt}
        className={styles.heroMasterImage}
        fill
        priority
        sizes="1440px"
        src={direction.masterImage}
      />
      <div className={styles.heroShade} />
      <div className={styles.heroNavMock}>
        <BrandLockup compact direction={direction} />
        <div aria-label="首页导航">
          <span>产品</span>
          <span>模板与 Skills</span>
          <span>案例</span>
          <span>价格</span>
        </div>
        <span className={styles.navCta}>进入工作台</span>
      </div>
      <div className={styles.heroCopy}>
        <p className={styles.kicker}>AI PRESENTATION WORKBENCH</p>
        <h3>从想法、资料和数据，<br />到真正可交付的演示。</h3>
        <p className={styles.heroBody}>总控智能体负责策划、编排、检查与交付，你始终可以编辑每一页。</p>
        <HeroActions />
        <DeliveryFormats />
      </div>
      {direction.id === "b" && <div className={styles.editorialRule}>PRESENTATION AS PUBLISHING</div>}
      {direction.id === "c" && (
        <div className={styles.controlLegend}>
          <span><CheckCircle2 aria-hidden="true" size={15} />资料已解析</span>
          <span><Workflow aria-hidden="true" size={15} />正在编排叙事</span>
          <span><ShieldCheck aria-hidden="true" size={15} />准备质量检查</span>
        </div>
      )}
    </div>
  );
}

function MobileHero({ direction }: { direction: DirectionSpec }) {
  return (
    <div className={`${styles.mobileScreen} ${styles[`mobileHero_${direction.id}`]}`} data-export="mobile-hero" id="export-mobile-hero">
      <div className={styles.mobileTop}>
        <BrandLockup compact direction={direction} />
        <span className={styles.mobileMenu}>菜单</span>
      </div>
      <div className={styles.mobileImage}>
        <Image alt={direction.imageAlt} fill sizes="390px" src={direction.masterImage} />
      </div>
      <div className={styles.mobileCopy}>
        <h3>从资料到<br />可交付的演示。</h3>
        <p>智能体完成策划、编排和检查，你负责最后判断。</p>
        <a className={styles.primaryAction} href="#create-center">开始创作 <ArrowRight aria-hidden="true" size={16} /></a>
        <div className={styles.mobileFormats}>PPTX / HTML / PNG / CANVAS</div>
      </div>
    </div>
  );
}

const creationEntries = [
  { label: "输入主题", icon: Sparkles },
  { label: "上传文档", icon: FileText },
  { label: "导入数据", icon: FileSpreadsheet },
  { label: "改造旧 PPT", icon: Presentation },
  { label: "读取网页", icon: Globe2 },
] as const;

function CreateCenter({ direction }: { direction: DirectionSpec }) {
  return (
    <div className={`${styles.productScreen} ${styles[`createScreen_${direction.id}`]}`} data-export="create-center" id="export-create-center">
      <div className={styles.productTopbar}>
        <BrandLockup compact direction={direction} />
        <span>创建演示</span>
        <span className={styles.topbarAction}>项目库</span>
      </div>
      <div className={styles.createBody}>
        <div className={styles.createIntro}>
          <p className={styles.kicker}>创建中心</p>
          <h3>从一个目标或一份资料开始。</h3>
          <p>告诉智能体演示对象、场合与目标。资料不足时，它只会追问最关键的三件事。</p>
        </div>
        <form className={styles.createForm}>
          <label className={styles.goalField}>
            <span>这次演示要解决什么问题？</span>
            <textarea defaultValue="为管理层说明 AIPPT 五阶段智能生成管线，并形成可编辑的内部汇报。" rows={3} />
          </label>
          <div className={styles.creationEntries}>
            {creationEntries.map(({ label, icon: Icon }) => (
              <button key={label} type="button">
                <Icon aria-hidden="true" size={20} />
                <span>{label}</span>
              </button>
            ))}
          </div>
          <label className={styles.fileDrop} htmlFor={`file-${direction.id}`}>
            <UploadCloud aria-hidden="true" size={25} />
            <span><strong>拖入 Word、PDF、Excel、旧 PPT 或图片</strong><small>文件会先经过结构与来源预检</small></span>
          </label>
          <input className={styles.srOnly} id={`file-${direction.id}`} multiple type="file" />
          <a className={styles.createSubmit} href="#agent-execution">让智能体开始创作 <ArrowRight aria-hidden="true" size={17} /></a>
        </form>
      </div>
    </div>
  );
}

const agentTasks = [
  ["理解目标", "演示对象为管理层，目标是解释生产链路"],
  ["解析资料", "已识别产品约束、来源与交付格式"],
  ["规划叙事", "用五阶段主线组织一页关键演示"],
  ["选择模板", "匹配当前视觉方向与 16:9 页面结构"],
  ["检查页面", "验证层级、来源、可编辑性与导出"],
] as const;

function AgentStudio({ direction }: { direction: DirectionSpec }) {
  return (
    <div className={`${styles.productScreen} ${styles[`agentScreen_${direction.id}`]}`} data-export="agent-execution" id="export-agent-execution">
      <div className={styles.productTopbar}>
        <BrandLockup compact direction={direction} />
        <span>智能体执行</span>
        <span className={styles.topbarAction}>可随时暂停</span>
      </div>
      <div className={styles.agentBody}>
        <aside className={styles.agentSummary}>
          <p className={styles.kicker}>当前任务</p>
          <h3>AIPPT 五阶段智能生成管线</h3>
          <dl>
            <div><dt>听众</dt><dd>管理层与产品团队</dd></div>
            <div><dt>页数</dt><dd>5 页可编辑演示</dd></div>
            <div><dt>交付</dt><dd>PPTX、PDF、PNG</dd></div>
          </dl>
        </aside>
        <div className={styles.agentTimeline}>
          {agentTasks.map(([title, detail], index) => (
            <div className={index === 2 ? styles.activeTask : styles.agentTask} key={title}>
              {index < 2 ? <CheckCircle2 aria-hidden="true" size={22} /> : index === 2 ? <Sparkles aria-hidden="true" size={22} /> : <span className={styles.pendingTaskIcon} />}
              <div><strong>{title}</strong><span>{detail}</span></div>
              <small>{index < 2 ? "已完成" : index === 2 ? "执行中" : "待处理"}</small>
            </div>
          ))}
        </div>
        <div className={styles.agentProof}>
          <div className={styles.agentProofHeader}><Presentation aria-hidden="true" size={18} />页面结构预览</div>
          <SlideCanvas compact direction={direction} />
        </div>
      </div>
    </div>
  );
}

function MiniSlide({ direction, active, label }: { direction: DirectionSpec; active?: boolean; label: string }) {
  return (
    <div className={`${styles.miniSlide} ${active ? styles.miniSlideActive : ""}`}>
      <span>{label}</span>
      <strong>{label === "封面" ? "AIPPT 生成管线" : label}</strong>
      <i style={{ backgroundColor: direction.accent }} />
    </div>
  );
}

function EditorScreen({ direction }: { direction: DirectionSpec }) {
  return (
    <div className={`${styles.editorScreen} ${styles[`editorScreen_${direction.id}`]}`} data-export="editor" id="export-editor">
      <div className={styles.editorTopbar}>
        <span className={styles.backAction}><ArrowLeft aria-hidden="true" size={16} />项目</span>
        <strong>AIPPT 五阶段智能生成管线</strong>
        <span className={styles.savedState}><CheckCircle2 aria-hidden="true" size={15} />已保存</span>
        <div className={styles.editorTopActions}>
          <button aria-label="撤销" type="button"><Undo2 aria-hidden="true" size={17} /></button>
          <button aria-label="重做" type="button"><Redo2 aria-hidden="true" size={17} /></button>
          <button type="button">检查与交付 <ArrowRight aria-hidden="true" size={15} /></button>
        </div>
      </div>
      <aside className={styles.slideRail} aria-label="演示页面">
        <MiniSlide active direction={direction} label="封面" />
        <MiniSlide direction={direction} label="理解目标" />
        <MiniSlide direction={direction} label="资料解析" />
        <MiniSlide direction={direction} label="叙事编排" />
        <MiniSlide direction={direction} label="质量交付" />
        <button type="button">添加页面</button>
      </aside>
      <div className={styles.editorToolbar}>
        <button type="button"><FileText aria-hidden="true" size={16} />文字</button>
        <button type="button"><ImageIcon aria-hidden="true" size={16} />图片</button>
        <button type="button"><PanelsTopLeft aria-hidden="true" size={16} />布局</button>
        <span />
        <button type="button"><SlidersHorizontal aria-hidden="true" size={16} />16:9</button>
      </div>
      <div className={styles.editorCanvasArea}>
        <SlideCanvas direction={direction} />
      </div>
      <aside className={styles.inspector}>
        <div className={styles.inspectorTabs}><strong>智能体</strong><span>属性</span></div>
        <div className={styles.inspectorBody}>
          <div className={styles.agentPromptTitle}><MousePointer2 aria-hidden="true" size={18} /><strong>只修改当前页</strong></div>
          <p>描述你希望调整的内容。其他页面和已确认数据不会改变。</p>
          <textarea defaultValue="把五阶段关系表达得更清楚，并保持所有内容可编辑。" rows={5} />
          <button type="button"><Send aria-hidden="true" size={16} />应用修改</button>
        </div>
      </aside>
      <footer className={styles.editorStatus}>
        <span>第 1 / 5 页</span>
        <span>备注：强调同一 Presentation IR 支持多种交付</span>
        <span>1920 × 1080</span>
      </footer>
    </div>
  );
}

function SlideCanvas({ direction, compact = false }: { direction: DirectionSpec; compact?: boolean }) {
  return (
    <div className={`${styles.slideCanvas} ${styles[`slideCanvas_${direction.id}`]} ${compact ? styles.slideCanvasCompact : ""}`}>
      <div className={styles.slideHeading}>
        <span>AIPPT 工作方法</span>
        <h3>AIPPT 五阶段智能生成管线</h3>
        <p>从目标理解到质量检查，同一内容源持续保持可编辑和可追踪。</p>
      </div>
      <div className={styles.pipeline}>
        {[
          ["理解", "目标与听众"],
          ["资料", "解析与来源"],
          ["蓝图", "叙事与版式"],
          ["生成", "五页可编辑"],
          ["交付", "检查与导出"],
        ].map(([title, detail]) => (
          <div className={styles.pipelineItem} key={title}>
            <strong>{title}</strong>
            <span>{detail}</span>
          </div>
        ))}
      </div>
      <div className={styles.slideFooter}>
        <span>Presentation IR</span>
        <span>PPTX / HTML / PNG / 自由画布</span>
      </div>
    </div>
  );
}

const skills = [
  ["研究", "提取可引用资料与来源"],
  ["图表", "把数据转换为可编辑图表"],
  ["品牌检查", "验证字体、颜色与 Logo 使用"],
  ["兼容检查", "验证 PowerPoint 与 WPS 交付"],
] as const;

function TemplateSkills({ direction }: { direction: DirectionSpec }) {
  return (
    <div className={`${styles.templateStage} ${styles[`templateStage_${direction.id}`]}`} data-export="templates-skills" id="export-templates-skills">
      <div className={styles.featuredTemplate}>
        <div className={styles.templateMeta}><LayoutTemplate aria-hidden="true" size={18} /><span>经营汇报模板</span></div>
        <SlideCanvas compact direction={direction} />
      </div>
      <div className={styles.templateStack}>
        <div><SlideCanvas compact direction={direction} /><span>融资路演</span></div>
        <div><SlideCanvas compact direction={direction} /><span>产品发布</span></div>
      </div>
      <div className={styles.skillsPanel}>
        <div className={styles.skillsTitle}><Sparkles aria-hidden="true" size={19} /><strong>本页可调用的 Skills</strong></div>
        {skills.map(([name, detail]) => (
          <button key={name} type="button">
            <span><strong>{name}</strong><small>{detail}</small></span>
            <ArrowRight aria-hidden="true" size={16} />
          </button>
        ))}
      </div>
    </div>
  );
}

function BrandSystem({ direction }: { direction: DirectionSpec }) {
  return (
    <div className={styles.brandSystem} data-export="brand-system" id="export-brand-system">
      <div className={styles.brandHero}>
        <div className={styles.brandHeroMark}><DirectionMark id={direction.id} size={68} /></div>
        <div><h3>{direction.codeNameCn}</h3><p>{direction.codeNameEn}</p></div>
      </div>
      <div className={styles.brandVersions}>
        <div className={styles.brandOnLight}><BrandLockup direction={direction} /><small>浅色背景</small></div>
        <div className={styles.brandOnDark}><BrandLockup direction={direction} /><small>深色背景</small></div>
        <div className={styles.brandMono}><BrandLockup direction={direction} /><small>黑白版本</small></div>
        <div className={styles.brandSmall}><DirectionMark id={direction.id} size={18} /><DirectionMark id={direction.id} size={28} /><DirectionMark id={direction.id} size={40} /><small>小尺寸图标</small></div>
      </div>
      <div className={styles.brandLogic}>
        <strong>符号逻辑</strong>
        <p>{direction.logoLogic}</p>
        <div className={styles.logoMotionFrames} aria-label="动态 Logo 逻辑">
          <span><DirectionMark id={direction.id} size={18} /></span>
          <span><DirectionMark id={direction.id} size={24} /></span>
          <span><DirectionMark id={direction.id} size={30} /></span>
        </div>
      </div>
    </div>
  );
}

function IpSystem({ direction }: { direction: DirectionSpec }) {
  const states = ["待命", "编排", "检查"];
  return (
    <div className={styles.ipSystem} data-export="ip-system" id="export-ip-system">
      <div className={styles.ipPortrait}>
        <Image alt={`${direction.ipName}概念图`} fill sizes="720px" src={direction.masterImage} />
      </div>
      <div className={styles.ipDescription}>
        <p className={styles.kicker}>IP 方向</p>
        <h3>{direction.ipName}</h3>
        <p>{direction.ipLogic}</p>
        <div className={styles.ipStates}>
          {states.map((state, index) => (
            <div className={styles.ipState} key={state}>
              <div className={styles.ipStateCrop} style={{ "--state": index } as React.CSSProperties}>
                <Image alt="" aria-hidden="true" fill sizes="180px" src={direction.masterImage} />
              </div>
              <strong>{state}</strong>
              <span>{index === 0 ? "保持安静" : index === 1 ? "拆分与汇聚" : "收敛为结果"}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function VisualSystem({ direction }: { direction: DirectionSpec }) {
  return (
    <div className={styles.visualSystem} data-export="visual-system" id="export-visual-system">
      <div className={styles.palettePanel}>
        <h3>色彩</h3>
        <div className={styles.swatches}>
          {direction.palette.map((color) => (
            <div key={color.value}>
              <span style={{ backgroundColor: color.value }} />
              <strong>{color.name}</strong>
              <small>{color.value}</small>
            </div>
          ))}
        </div>
      </div>
      <div className={styles.typePanel}>
        <h3>字体</h3>
        <p className={styles.typeDisplay}>演示不是图片，它仍然可以编辑。</p>
        <div className={styles.typeMeta}>
          {direction.fonts.map((font) => <span key={font}>{font}</span>)}
        </div>
        <p>正文以 14-16px 为基础，标题控制在两行以内，数字与交付格式保持清楚。</p>
      </div>
      <div className={styles.photoPanel}>
        <Image alt={`${direction.title}摄影与材质方向`} fill sizes="520px" src={direction.masterImage} />
        <div><strong>摄影与材质</strong><span>{direction.artDirection}</span></div>
      </div>
    </div>
  );
}

const motionActs = [
  ["建立世界", "产品承诺出现"],
  ["资料进入", "多种来源汇入"],
  ["智能编排", "步骤逐项可见"],
  ["多种交付", "同一内容分流"],
  ["作品抵达", "模板与 Skills 收束"],
] as const;

function MotionFrames({ direction }: { direction: DirectionSpec }) {
  return (
    <div className={styles.motionSystem} data-export="motion-frames" id="export-motion-frames">
      <div className={styles.motionSummary}>
        <h3>{direction.motionLogic}</h3>
        <div><span>营销 {direction.marketingDials}</span><span>产品 {direction.productDials}</span></div>
      </div>
      <div className={styles.motionFrames}>
        {motionActs.map(([title, detail], index) => (
          <figure key={title} style={{ "--frame": index } as React.CSSProperties}>
            <div className={styles.motionImage}>
              <Image alt="" aria-hidden="true" fill sizes="300px" src={direction.masterImage} />
            </div>
            <figcaption><strong>{title}</strong><span>{detail}</span></figcaption>
          </figure>
        ))}
      </div>
      <div className={styles.reducedMotionNote}>
        <ShieldCheck aria-hidden="true" size={19} />
        <span><strong>Reduced Motion</strong> 取消视差、循环和滚动绑定，五幕内容按静态顺序完整呈现。</span>
      </div>
    </div>
  );
}

function ArchitectureRail() {
  return (
    <div className={styles.architectureRail} aria-label="着陆页完整信息架构">
      {informationArchitecture.map((item) => <span key={item}>{item}</span>)}
    </div>
  );
}

export function DirectionBoard({ direction }: { direction: DirectionSpec }) {
  return (
    <main className={`${styles.boardRoot} ${styles[`direction_${direction.id}`]}`} data-direction={direction.id}>
      <DirectionNav current={direction.id} />
      <header className={styles.boardIntro}>
        <Link className={styles.backLink} href="/visual-directions"><ArrowLeft aria-hidden="true" size={17} />返回三方向总览</Link>
        <div className={styles.boardIntroGrid}>
          <div>
            <p className={styles.kicker}>{direction.id.toUpperCase()} / {direction.codeNameCn} / {direction.codeNameEn}</p>
            <h1>{direction.title}</h1>
            <p>{direction.thesis}</p>
            <div className={styles.dials}><span>营销 {direction.marketingDials}</span><span>产品 {direction.productDials}</span><CostLabel cost={direction.cost} /></div>
          </div>
          <div className={styles.introImage}>
            <Image alt={direction.imageAlt} fill priority sizes="720px" src={direction.masterImage} />
          </div>
        </div>
        <ArchitectureRail />
      </header>

      <div className={styles.boardModules} data-export="direction-board">
        <BoardModule dataModule="desktop-hero" description={moduleDescriptions.desktopHero} title="桌面端着陆页首屏">
          <DesktopHero direction={direction} />
        </BoardModule>
        <BoardModule dataModule="mobile-hero" description={moduleDescriptions.mobileHero} title="移动端首屏">
          <MobileHero direction={direction} />
        </BoardModule>
        <BoardModule dataModule="create-center" description={moduleDescriptions.create} id="create-center" title="创建中心">
          <CreateCenter direction={direction} />
        </BoardModule>
        <BoardModule dataModule="agent-execution" description={moduleDescriptions.agent} id="agent-execution" title="智能体执行页">
          <AgentStudio direction={direction} />
        </BoardModule>
        <BoardModule dataModule="editor" description={moduleDescriptions.editor} title="标准 PPT 编辑器">
          <EditorScreen direction={direction} />
        </BoardModule>
        <BoardModule dataModule="templates-skills" description={moduleDescriptions.templates} title="模板与 Skills">
          <TemplateSkills direction={direction} />
        </BoardModule>
        <BoardModule dataModule="brand" description={moduleDescriptions.brand} title="Logo 与品牌方向">
          <BrandSystem direction={direction} />
        </BoardModule>
        <BoardModule dataModule="ip" description={moduleDescriptions.ip} title="IP 方向与状态">
          <IpSystem direction={direction} />
        </BoardModule>
        <BoardModule dataModule="visual-system" description={moduleDescriptions.visual} title="色彩、字体与摄影">
          <VisualSystem direction={direction} />
        </BoardModule>
        <BoardModule dataModule="motion" description={moduleDescriptions.motion} title="五幕动效关键帧">
          <MotionFrames direction={direction} />
        </BoardModule>
        <BoardModule dataModule="ppt-sample" description={moduleDescriptions.slide} id="ppt-sample" title="真实 PPT 样例">
          <div className={styles.slideExport} data-export="ppt-sample" id="export-ppt-sample">
            <SlideCanvas direction={direction} />
          </div>
        </BoardModule>
      </div>

      <footer className={styles.boardFooter}>
        <div>
          <strong>优势</strong>
          <p>{direction.strength}</p>
        </div>
        <div>
          <strong>风险</strong>
          <p>{direction.risk}</p>
        </div>
        <Link href="/visual-directions">比较另外两套方向 <ArrowRight aria-hidden="true" size={17} /></Link>
      </footer>
    </main>
  );
}
