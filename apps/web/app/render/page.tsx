export const dynamic = "force-dynamic";

/** A clean, browser-printable presentation surface for PDF/PNG render workers. */
export default async function RenderPage({ searchParams }: { searchParams: Promise<{ slide?: string }> }) {
  const params = await searchParams;
  const index = Math.max(0, Math.min(4, Number(params.slide || 1) - 1));
  const pages = [
    ["让增长在每一次\n决策中发生", "2025 年度经营分析与增长规划", "#176bff"],
    ["增长的三个确定性", "洞察 · 效率 · 组织", "#22d9ff"],
    ["市场正在重新定义效率", "关键变化与回应", "#ff8a2a"],
    ["增长操作系统", "从洞察到执行的闭环", "#176bff"],
    ["下一步，从共识开始", "一个可衡量的 90 天行动计划", "#22d9ff"]
  ];
  const [title, sub, accent] = pages[index];
  return <main style={{ width: "1280px", height: "720px", position: "relative", overflow: "hidden", background: "#fff", fontFamily: "Inter, Arial, sans-serif", color: "#071b46" }}>
    <div style={{ position:"absolute", width:500, height:500, borderRadius:"50%", right:-180, bottom:-210, background:`${accent}22` }} />
    <small style={{ position:"absolute", top:68, left:96, color:accent, fontWeight:800, letterSpacing:2 }}>AIPPT · INTELLIGENT PRESENTATION</small>
    <h1 style={{ position:"absolute", top:112, left:96, whiteSpace:"pre-line", fontSize:52, lineHeight:1.15, letterSpacing:-2, margin:0 }}>{title}</h1>
    <p style={{ position:"absolute", top:300, left:101, fontSize:21, color:"#62718d" }}>{sub}</p>
    <div style={{ position:"absolute", left:96, top:400, width:320, height:9, borderRadius:9, background:accent }} />
    <div style={{ position:"absolute", right:102, top:102, width:315, height:420, borderRadius:26, background:`linear-gradient(145deg,#071b46,${accent})`, boxShadow:"0 18px 50px #163b7633" }}><div style={{ position:"absolute", left:22,right:22,bottom:28,color:"white",fontSize:14 }}>珠江新城 · 2025</div></div>
    <small style={{ position:"absolute", bottom:64, left:96, color:"#8291ae" }}>AIPPT / 页核·智核</small>
  </main>;
}
