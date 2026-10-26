import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));
const webRoot = path.join(repositoryRoot, "apps", "web");
const requireFromWeb = createRequire(path.join(webRoot, "package.json"));
const { chromium } = requireFromWeb("playwright-core");

const read = (relativePath) => readFile(path.join(repositoryRoot, relativePath), "utf8");
const sixStages = ["brief", "outline", "generate", "edit", "review", "export"];

test("P1 route contract keeps all six stages project-scoped", async () => {
  const routes = await read("apps/web/lib/project-routes.ts");
  const stageRoute = await read("apps/web/app/projects/[projectId]/[stage]/page.tsx");
  const projectRoute = await read("apps/web/app/projects/[projectId]/page.tsx");

  for (const stage of sixStages) assert.match(routes, new RegExp(`\\"${stage}\\"`), `missing stage ${stage}`);
  assert.match(routes, /encodeURIComponent\(projectId\)/, "projectHref must encode and include projectId");
  assert.match(stageRoute, /projectId.*stage|stage.*projectId/s, "stage route must receive projectId and stage params");
  assert.match(projectRoute, /projectId/, "project landing route must receive projectId");
});

test("P1 source contract prevents implicit review/export links", async () => {
  const files = [
    "apps/web/app/page.tsx",
    "apps/web/app/projects/[projectId]/page.tsx",
    "apps/web/app/projects/[projectId]/[stage]/page.tsx",
    "apps/web/components/project-data/project-route-shell.tsx",
  ];
  const source = (await Promise.all(files.map(read))).join("\n");
  assert.doesNotMatch(source, /href\s*=\s*[\"'`]\/(?:review|export)[\"'`]/, "review/export must not be global bare links");
  assert.doesNotMatch(source, /href\s*=\s*[\"'`]\/projects\/(?:review|export)[\"'`]/, "review/export must not be project-less links");
});

test("P1 data contract carries revision, stale state, and slideId", async () => {
  const types = await read("apps/web/lib/project-types.ts");
  const repository = await read("apps/web/lib/project-repository.ts");
  const store = await read("apps/web/lib/project-store.ts");
  const service = await read("apps/web/lib/project-service.ts");

  assert.match(types, /revision:\s*number/, "projects and reports must carry revision");
  assert.match(types, /status:\s*ProjectJobStatus/, "jobs must carry a state");
  assert.match(types, /stale/, "stale must be a first-class job/report state");
  assert.match(types, /slideId\?:\s*string/, "quality issues must expose slideId");
  assert.match(repository, /slideId:\s*typeof issue\.slideId/, "repository must preserve issue slideId");
  assert.match(store, /projectId !== update\.projectId|update\.projectId.*projectId/s, "revision writes must be project-scoped");
  assert.match(store, /status:\s*\"stale\"/, "revision writes must stale prior jobs/reports");
  assert.match(service, /current\.projectId !== job\.projectId\s*\|\|\s*current\.revision !== job\.revision/, "late job responses must be rejected as stale");
});

test("P1 project shell source exposes project identity and current version", async () => {
  const shell = await read("apps/web/components/project-data/project-route-shell.tsx");
  assert.match(shell, /data-project-id=\{projectId\}/, "ProjectShell must expose project identity");
  assert.match(shell, /data-project-stage=\{stage\}/, "ProjectShell must expose current stage");
  assert.match(shell, /project\.revision/, "ProjectShell must render current revision");
  assert.match(shell, /project\.slides\.length/, "delivery count must be derived from current slides");
});

const fixture = {
  project: {
    id: "project-p1-a",
    title: "华南区域经营分析",
    brief: {
      originalPrompt: "华南区域经营分析",
      topic: "华南区域经营分析",
      language: "zh-CN",
      pageCount: 6,
      sourceFileIds: [],
    },
    outline: [],
    theme: { name: "AIPPT Signal" },
    slides: [
      { id: "slide-1", title: "经营概览" },
      { id: "slide-2", title: "增长机会" },
      { id: "slide-3", title: "行动计划" },
      { id: "slide-4", title: "区域拆解" },
      { id: "slide-5", title: "风险" },
      { id: "slide-6", title: "结论" },
    ],
    activeSlideId: "slide-2",
    generationStatus: "success",
    revision: 2,
    qualityReport: {
      revision: 1,
      status: "success",
      score: 92,
      issues: [{ code: "CONTENT_GAP", message: "行动计划缺少负责人", slideId: "slide-2" }],
    },
    exportJobs: [{ id: "export-v1", projectId: "project-p1-a", revision: 1, type: "export", status: "success", format: "pptx" }],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  presentationId: "presentation-p1-a",
  jobs: [],
  source: "api",
  loadedAt: "2026-01-01T00:00:00.000Z",
};

let browser;
let server;
let serverOutput = "";
let baseUrl = process.env.AIPPT_E2E_BASE_URL?.replace(/\/$/, "");

function rememberServerOutput(chunk) {
  serverOutput = `${serverOutput}${chunk}`.slice(-8_000);
}

async function waitForServer(url, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (server?.exitCode !== null) throw new Error(`Web server exited before becoming ready.\n${serverOutput}`);
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // The development server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${url}.\n${serverOutput}`);
}

before(async () => {
  if (!baseUrl) {
    const port = Number(process.env.AIPPT_E2E_PORT ?? 42_000 + Math.floor(Math.random() * 1_000));
    baseUrl = `http://127.0.0.1:${port}`;
    const nextBin = requireFromWeb.resolve("next/dist/bin/next");
    server = spawn(process.execPath, [nextBin, "start", "--hostname", "127.0.0.1", "--port", String(port)], {
      cwd: webRoot,
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    server.stdout.on("data", rememberServerOutput);
    server.stderr.on("data", rememberServerOutput);
    await waitForServer(baseUrl);
  }
  browser = await chromium.launch({ headless: true, channel: process.env.AIPPT_BROWSER_CHANNEL || "chrome" });
}, { timeout: 90_000 });

after(async () => {
  await browser?.close();
  if (server?.exitCode === null) server.kill();
});

test("P1 project stages load the requested project and keep delivery count dynamic", async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  await page.route("**/api/projects/project-p1-a/workbench", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      project: {
        id: fixture.project.id,
        name: fixture.project.title,
        topic: fixture.project.brief.topic,
        createdAt: fixture.project.createdAt,
        updatedAt: fixture.project.updatedAt,
      },
      presentation: {
        id: fixture.presentationId,
        projectId: fixture.project.id,
        title: fixture.project.title,
        revision: fixture.project.revision,
        brief: fixture.project.brief,
        storyboard: fixture.project.outline,
        slides: fixture.project.slides,
        createdAt: fixture.project.createdAt,
        updatedAt: fixture.project.updatedAt,
      },
      quality: fixture.project.qualityReport,
      exports: fixture.project.exportJobs,
    }) });
  });

  try {
    for (const stage of sixStages) {
      const response = await page.goto(`${baseUrl}/projects/${fixture.project.id}/${stage}`, { waitUntil: "domcontentloaded" });
      assert.equal(response?.status(), 200, `${stage} did not return HTTP 200`);
      const shell = page.locator(`[data-project-id="${fixture.project.id}"][data-project-stage="${stage}"]`);
      await shell.waitFor({ state: "visible" });
      await assert.doesNotReject(async () => shell.getByText(fixture.project.title, { exact: true }).first().waitFor({ state: "visible" }));
      await assert.doesNotReject(async () => shell.getByText(/v2/).waitFor({ state: "visible" }));
      assert.match(page.url(), new RegExp(`/projects/${fixture.project.id}/${stage}$`));
    }

    await page.goto(`${baseUrl}/projects/${fixture.project.id}/review`, { waitUntil: "domcontentloaded" });
    await page.locator(`[data-project-id="${fixture.project.id}"][data-project-stage="review"]`).waitFor({ state: "visible" });
    const reviewBody = await page.locator("body").innerText();
    assert.match(reviewBody, /slide-2/, "review must keep issue location slideId");
    assert.match(reviewBody, /重新检查|需要重新检查|过期|stale/i, "review must mark the v1 report stale for v2");

    await page.goto(`${baseUrl}/projects/${fixture.project.id}/export`, { waitUntil: "domcontentloaded" });
    await page.locator(`[data-project-id="${fixture.project.id}"][data-project-stage="export"]`).waitFor({ state: "visible" });
    const exportBody = await page.locator("body").innerText();
    assert.match(exportBody, /6\s*页/, "delivery must use current slide count");
    assert.match(exportBody, /v2/, "delivery must name the export revision");
  } finally {
    await context.close();
  }
}, { timeout: 90_000 });

test("P1 blocks project-less review/export instead of opening an implicit project", async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  try {
    for (const stage of ["review", "export"]) {
      const response = await page.goto(`${baseUrl}/projects/${stage}`, { waitUntil: "domcontentloaded" });
      assert.ok([200, 302, 307, 404].includes(response?.status()), `${stage} must fail closed, not 500`);
      assert.equal(await page.locator("[data-project-id]").count(), 0, `${stage} opened an implicit project`);
    }
  } finally {
    await context.close();
  }
}, { timeout: 60_000 });
