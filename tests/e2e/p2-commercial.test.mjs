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

let browser;
let server;
let serverOutput = "";
let baseUrl = process.env.AIPPT_E2E_BASE_URL?.replace(/\/$/, "");

function rememberServerOutput(chunk) { serverOutput = `${serverOutput}${chunk}`.slice(-8_000); }

async function waitForServer(url, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (server?.exitCode !== null) throw new Error(`Web server exited before becoming ready.\n${serverOutput}`);
    try { if ((await fetch(url)).ok) return; } catch { /* server is still starting */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${url}.\n${serverOutput}`);
}

async function isNextServer(url) {
  try { return (await fetch(url, { signal: AbortSignal.timeout(2_000) })).headers.get("x-powered-by") === "Next.js"; } catch { return false; }
}

before(async () => {
  if (!baseUrl) {
    if (await isNextServer("http://localhost:3000")) baseUrl = "http://localhost:3000";
    else {
      const port = Number(process.env.AIPPT_E2E_PORT ?? 43_000 + Math.floor(Math.random() * 1_000));
      baseUrl = `http://127.0.0.1:${port}`;
      const nextBin = requireFromWeb.resolve("next/dist/bin/next");
      server = spawn(process.execPath, [nextBin, "dev", "--hostname", "127.0.0.1", "--port", String(port)], { cwd: webRoot, env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" }, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
      server.stdout.on("data", rememberServerOutput); server.stderr.on("data", rememberServerOutput);
      await waitForServer(baseUrl);
    }
  }
  browser = await chromium.launch({ headless: true });
}, { timeout: 90_000 });

after(async () => { await browser?.close(); if (server?.exitCode === null) server.kill(); });

test("P2 frontend exposes pricing, usage, billing and checkout routes", async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    for (const route of ["/pricing", "/account/usage", "/account/billing", "/checkout/success", "/checkout/cancel"]) {
      const response = await page.goto(`${baseUrl}${route}`, { waitUntil: "domcontentloaded" });
      assert.equal(response?.status(), 200, `${route} must be a real page route`);
      assert.match(page.url(), new RegExp(`${route.replaceAll("/", "\\/")}(?:[?/#]|$)`));
    }
  } finally { await context.close(); }
}, { timeout: 90_000 });

test("P2 source contract carries upgrade reason and preserves returnTo/resumeAction", async () => {
  const source = (await Promise.all([
    read("apps/web/app/pricing/page.tsx"),
    read("apps/web/app/account/usage/page.tsx"),
    read("apps/web/app/account/billing/page.tsx"),
    read("apps/web/app/checkout/success/page.tsx"),
    read("apps/web/app/checkout/cancel/page.tsx"),
  ])).join("\n");
  assert.match(source, /reason/, "upgrade modal must retain the concrete trigger reason");
  assert.match(source, /returnTo/, "checkout must carry the originating route");
  assert.match(source, /resumeAction/, "checkout must carry the interrupted action");
  assert.match(source, /pricing|套餐|Pro/i);
  assert.match(source, /usage|用量|AI 点/i);
});

test("P2 commercial journey goes Free -> gated advanced export -> upgrade -> original project -> export", async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const user = { planId: "free", balance: 300, entitlements: { maxPages: 10, maxProjects: 3, textModel: "standard", imageModel: "standard", brandedPptx: true, unbrandedPptx: false, pdf: false, png: false } };
  let checkoutRequest;

  await page.route("**/api/account/usage", async (route) => await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ usage: user }) }));
  await page.route("**/api/projects/commercial-project/workbench", async (route) => await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ project: { id: "commercial-project", name: "商业闭环演示", title: "商业闭环演示", revision: 1 }, presentation: { id: "commercial-presentation", projectId: "commercial-project", title: "商业闭环演示", revision: 1, slides: Array.from({ length: 6 }, (_, index) => ({ id: `slide-${index + 1}`, title: `页面 ${index + 1}`, elements: [] })) }, qualityReport: null, exports: [], jobs: [] }) }));
  await page.route("**/api/presentations/commercial-presentation/exports", async (route) => {
    if (user.planId === "free") {
      await route.fulfill({ status: 402, contentType: "application/json", body: JSON.stringify({ error: { code: "UPGRADE_REQUIRED", reason: "unbranded-pptx", message: "Pro 才能导出无品牌 PPTX" } }) });
      return;
    }
    await route.fulfill({ status: 202, contentType: "application/json", body: JSON.stringify({ export: { id: "commercial-export", status: "success", format: "pptx", branded: false } }) });
  });
  const checkoutHandler = async (route) => {
    checkoutRequest = route.request().postDataJSON();
    user.planId = "pro"; user.balance = 3000; user.entitlements = { maxPages: 30, maxProjects: Infinity, textModel: "advanced", imageModel: "advanced", brandedPptx: false, unbrandedPptx: true, pdf: true, png: true };
    const completeUrl = `/checkout/success?returnTo=${encodeURIComponent(checkoutRequest.returnTo)}`;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ checkout: { id: "mock-checkout", status: "pending", provider: "mock", mode: "development", completeUrl, cancelUrl: "/checkout/cancel", returnTo: checkoutRequest.returnTo, resumeAction: checkoutRequest.resumeAction } }) });
  };
  await page.route("**/api/checkout", checkoutHandler);
  await page.route("**/api/checkout/start", checkoutHandler);
  await page.route("**/api/exports/commercial-export/status", async (route) => await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ export: { id: "commercial-export", status: "success", format: "pptx", branded: false } }) }));
  await page.route("**/api/exports/commercial-export/download", async (route) => await route.fulfill({ status: 200, contentType: "application/vnd.openxmlformats-officedocument.presentationml.presentation", body: Buffer.from("PK-commercial") }));

  try {
    await page.goto(`${baseUrl}/projects/commercial-project/export`, { waitUntil: "domcontentloaded" });
    await page.getByText(/Free/).first().waitFor({ state: "visible" });
    await page.getByRole("button", { name: /无品牌|PDF|PNG|高清|高级导出/i }).first().click();
    await page.getByText(/升级|Pro/i).first().waitFor({ state: "visible" });
    const modalText = await page.locator("body").innerText();
    assert.match(modalText, /无品牌|PDF|PNG|点数不足|高级功能/i, "upgrade modal must explain why this export is gated");
    await page.getByRole("button", { name: /升级|选择 Pro|继续购买|立即购买/i }).last().click();
    await page.waitForTimeout(100);
    assert.equal(checkoutRequest?.plan, "pro");
    assert.match(checkoutRequest?.returnTo ?? "", /projects\/commercial-project\/export/);
    assert.ok(checkoutRequest?.resumeAction, "checkout must preserve the interrupted export action");

    await page.waitForURL(/\/checkout\/success\?returnTo=/);
    await page.getByText(/支付成功|升级成功|Pro 已生效/i).waitFor({ state: "visible" });
    await page.getByRole("link", { name: /返回原项目|继续导出|回到项目/i }).click();
    await page.waitForURL(/\/projects\/commercial-project\/export/);
    await page.getByText(/Pro/).first().waitFor({ state: "visible" });
    const exportSucceeded = page.getByText(/导出成功|已完成|下载/i);
    if (!(await exportSucceeded.isVisible())) {
      await page.getByRole("button", { name: /无品牌|导出 PPTX|继续导出/i }).first().click();
      await page.getByRole("button", { name: /导出 版本/i }).click();
    }
    await exportSucceeded.waitFor({ state: "visible", timeout: 10_000 });
  } finally { await context.close(); }
}, { timeout: 90_000 });
