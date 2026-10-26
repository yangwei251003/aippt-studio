const apiOrigin = process.env.AIPPT_API_ORIGIN ?? "http://127.0.0.1:8787";
const webOrigin = process.env.AIPPT_WEB_ORIGIN ?? "http://127.0.0.1:3100";

async function readProjects(label, url) {
  let response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  } catch (error) {
    throw new Error(`${label} 无法连接：${error instanceof Error ? error.message : String(error)}`);
  }
  if (!response.ok) throw new Error(`${label} 返回 HTTP ${response.status}`);
  const payload = await response.json();
  if (!Array.isArray(payload.projects)) throw new Error(`${label} 返回的数据缺少 projects 数组`);
  return payload.projects;
}

const direct = await readProjects("AIPPT API", `${apiOrigin}/api/projects`);
const proxied = await readProjects("前端项目代理", `${webOrigin}/backend-api/api/projects`);

if (direct.length !== proxied.length) {
  throw new Error(`项目数量不一致：API=${direct.length}，前端代理=${proxied.length}`);
}

console.log(`项目服务正常：API 与前端代理均返回 ${direct.length} 个项目。`);
