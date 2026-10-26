import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));
const webRoot = path.join(repositoryRoot, "apps", "web");
const requireFromWeb = createRequire(path.join(webRoot, "package.json"));
const { chromium } = requireFromWeb("playwright-core");

const views = [
  { id: "home", title: "把零散想法", selector: "h1" },
  { id: "projects", title: "项目列表", selector: "h1" },
  { id: "create", title: "从一个真实需求开始", selector: "h1" },
  { id: "blueprint", title: "先统一叙事再生成页面", selector: "h1" },
  { id: "studio", title: "五个生成阶段 全程有迹可循", selector: "h1" },
  { id: "editor", title: "2025 年度经营分析与增长规划", selector: "header b" },
  { id: "quality", title: "交付前逐项校准", selector: "h1" },
  { id: "delivery", title: "交付给下一个重要时刻", selector: "h1" },
];

const viewports = [
  { name: "desktop", width: 1440, height: 1000 },
  { name: "mobile", width: 390, height: 844 },
];

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
    if (server?.exitCode !== null) {
      throw new Error(`Web server exited before becoming ready.\n${serverOutput}`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The development server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${url}.\n${serverOutput}`);
}

before(async () => {
  if (!baseUrl) {
    const port = Number(process.env.AIPPT_E2E_PORT ?? 41_000 + Math.floor(Math.random() * 1_000));
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

for (const viewport of viewports) {
  test(`${viewport.name}: all product views are reachable without page overflow`, async () => {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    const failures = [];

    try {
      for (const view of views) {
        try {
          const response = await page.goto(`${baseUrl}/?view=${view.id}`, { waitUntil: "domcontentloaded" });
          assert.equal(response?.status(), 200, `${view.id} did not return HTTP 200`);

          const heading = page.locator(view.selector).filter({ hasText: view.title }).first();
          await heading.waitFor({ state: "visible" });
          await page.evaluate(async () => { await document.fonts.ready; });

          const headingBox = await heading.boundingBox();
          assert.ok(
            headingBox && headingBox.y < viewport.height && headingBox.y + headingBox.height > 0,
            `${view.id} main title is outside the ${viewport.name} viewport`,
          );

          const layout = await page.evaluate(() => ({
            viewportWidth: window.innerWidth,
            documentWidth: document.documentElement.scrollWidth,
            bodyWidth: document.body.scrollWidth,
            offenders: [...document.body.querySelectorAll("*")]
              .map((element) => {
                const rect = element.getBoundingClientRect();
                return { tag: element.tagName.toLowerCase(), className: String(element.className).slice(0, 80), left: Math.round(rect.left), right: Math.round(rect.right) };
              })
              .filter((element) => element.right > window.innerWidth + 2)
              .sort((left, right) => right.right - left.right)
              .slice(0, 5),
          }));
          const renderedWidth = Math.max(layout.documentWidth, layout.bodyWidth);
          assert.ok(
            renderedWidth <= layout.viewportWidth + 2,
            `${view.id} horizontally overflows at ${viewport.width}px (${renderedWidth}px rendered); offenders: ${JSON.stringify(layout.offenders)}`,
          );
        } catch (error) {
          failures.push(error instanceof Error ? error.message : String(error));
        }
      }
      assert.equal(failures.length, 0, failures.join("\n"));
    } finally {
      await context.close();
    }
  }, { timeout: 90_000 });
}

test("home loads with reduced motion preference", async () => {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
  });
  const page = await context.newPage();

  try {
    const response = await page.goto(`${baseUrl}/?view=home`, { waitUntil: "domcontentloaded" });
    assert.equal(response?.status(), 200);
    assert.equal(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches), true);
    await page.locator("h1").filter({ hasText: "把零散想法" }).first().waitFor({ state: "visible" });
    assert.equal(await page.getByRole("button", { name: /开始|创建/ }).count() > 0, true);
  } finally {
    await context.close();
  }
});

test("create starts the canonical project-scoped brief flow", async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/?view=create`, { waitUntil: "domcontentloaded" });
    await page.route(/\/api\/projects$/, (route) => route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ project: { id: "canonical-project" } }),
    }));
    await page.route(/\/api\/projects\/canonical-project\/questions$/, (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ questions: [] }),
    }));
    const prompt = page.locator("textarea").first();
    await prompt.fill("琶洲 2035 会展韧性 90 天试点");
    await page.getByRole("button", { name: "开始理解" }).click();
    await page.waitForURL(/\/projects\/canonical-project\/brief$/);
  } finally {
    await context.close();
  }
});

test("projects shows a Chinese failure state and a real retry recovers the cards", async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  let shouldFail = true;
  await page.route(/\/api\/projects$/, async (route) => {
    if (shouldFail) {
      await route.abort("connectionrefused");
      return;
    }
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        projects: [{ id: "recovery-project", name: "恢复验收项目", updatedAt: "2026-08-22T08:00:00.000Z" }],
      }),
    });
  });
  await page.route(/\/api\/projects\/recovery-project\/workbench$/, (route) => route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ project: { id: "recovery-project", name: "恢复验收项目" } }),
    }));

  try {
    await page.goto(`${baseUrl}/?view=projects`, { waitUntil: "domcontentloaded" });
    await page.getByText(/暂时无法加载项目/).waitFor({ state: "visible" });
    await page.getByText("同步失败", { exact: true }).waitFor({ state: "visible" });
    assert.equal((await page.locator("body").innerText()).includes("Failed to fetch"), false);

    shouldFail = false;
    await page.getByRole("button", { name: "重新加载" }).click();
    await page.getByText("恢复验收项目", { exact: true }).first().waitFor({ state: "visible" });
    await page.getByText("同步成功", { exact: true }).waitFor({ state: "visible" });
    assert.equal(await page.getByText("同步失败", { exact: true }).count(), 0);
  } finally {
    await context.close();
  }
});
