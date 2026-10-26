import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createRequire } from "node:module";
import { readFile, readdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));
const webRoot = path.join(repositoryRoot, "apps", "web");
const requireFromWeb = createRequire(path.join(webRoot, "package.json"));
const { chromium } = requireFromWeb("playwright-core");

const read = (relativePath) => readFile(path.join(repositoryRoot, relativePath), "utf8");

async function readIfPresent(relativePath) {
  try {
    return await read(relativePath);
  } catch {
    return "";
  }
}

async function readLandingSources() {
  const paths = [
    "apps/web/app/page.tsx",
    "apps/web/app/landing.module.css",
    "apps/web/app/page.module.css",
  ];
  const landingDirectory = path.join(webRoot, "components", "landing");
  try {
    const names = await readdir(landingDirectory, { recursive: true });
    for (const name of names) {
      if (/hero|landing|marketing/i.test(name) && /\.(?:tsx?|css)$/.test(name)) {
        paths.push(path.join("apps/web/components/landing", name));
      }
    }
  } catch {
    // The hero can be colocated in the app route; the route files above remain required.
  }
  const contents = await Promise.all(paths.map(readIfPresent));
  return { paths, source: contents.join("\n") };
}

test("P3 source contract implements one five-act scroll scene", async () => {
  const { source } = await readLandingSources();

  assert.match(source, /HeroScrollScene|hero-scroll-scene|heroScrollScene/i, "home must expose a dedicated scroll-scene implementation");
  assert.match(source, /position\s*:\s*sticky/i, "hero stage must be sticky");
  assert.match(source, /4[2-9]\dvh|500vh/i, "hero scroll range must be approximately 420-500vh");
  assert.match(source, /\[0,\s*0\.18\][\s\S]*\[0\.18,\s*0\.38\][\s\S]*\[0\.38,\s*0\.6\][\s\S]*\[0\.6,\s*0\.82\][\s\S]*\[0\.82,\s*1\]/, "five acts must use the specified progress beats");
  assert.match(source, /data-hero-act|hero-act|act[s五幕]/i, "hero acts must be represented as distinct content");
  assert.match(source, /progress|scrollProgress/i, "all acts must derive from one scroll progress value");
  assert.match(source, /requestAnimationFrame|scrollY|IntersectionObserver/i, "scroll progress must react to the page position");
  assert.doesNotMatch(source, /setInterval\s*\(/i, "hero should not use independent timer loops for the narrative");
  assert.match(source, /pointer(?:move|\s*position)|clientX|pointerX/i, "desktop pointer parallax must be implemented");
  assert.match(source, /prefers-reduced-motion/i, "reduced-motion behavior must be explicit");
  assert.match(source, /@media[^{}]*max-width|matchMedia[^\n]*pointer|pointer:\s*coarse/i, "mobile behavior must be responsive");
  assert.doesNotMatch(source, /<video\b|from ['"]three['"]|@react-three|WebGLRenderer/i, "hero must remain DOM/CSS based");
});

test("P3 homepage source exposes conversion, proof and legal entry points", async () => {
  const { source } = await readLandingSources();

  assert.match(source, /从一句话[\s\S]{0,80}(?:可交付|专业演示)/, "hero title must promise a deliverable professional presentation");
  assert.match(source, /免费创建演示/, "primary CTA must be direct and free");
  for (const [label, pattern] of [
    ["workflow", /工作方式|workflow/i],
    ["templates", /模板|template/i],
    ["cases", /案例|case/i],
    ["pricing", /定价|pricing/i],
    ["faq", /FAQ|常见问题/i],
    ["trust", /信任|安全|trust/i],
    ["legal", /隐私|条款|法律|privacy|terms|legal/i],
  ]) {
    assert.match(source, pattern, `homepage must expose ${label}`);
  }
  assert.match(source, /登录|进入工作台|login|sign\s*in/i, "homepage must expose a workbench/login entry");
  assert.doesNotMatch(source, /女性头像|female.*avatar|debug.*avatar/i, "Page Core must remain the only product IP");
});

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

async function isNextServer(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });
    return response.headers.get("x-powered-by") === "Next.js";
  } catch {
    return false;
  }
}

before(async () => {
  if (!baseUrl) {
    if (await isNextServer("http://localhost:3000")) {
      baseUrl = "http://localhost:3000";
    } else {
      const port = Number(process.env.AIPPT_E2E_PORT ?? 44_000 + Math.floor(Math.random() * 1_000));
      baseUrl = `http://127.0.0.1:${port}`;
      const nextBin = requireFromWeb.resolve("next/dist/bin/next");
      server = spawn(process.execPath, [nextBin, "dev", "--hostname", "127.0.0.1", "--port", String(port)], {
        cwd: webRoot,
        env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      });
      server.stdout.on("data", rememberServerOutput);
      server.stderr.on("data", rememberServerOutput);
      await waitForServer(baseUrl);
    }
  }
  browser = await chromium.launch({ headless: true });
}, { timeout: 90_000 });

after(async () => {
  await browser?.close();
  if (server?.exitCode === null) server.kill();
});

test("P3 homepage keeps all narrative content available under reduced motion and stays responsive", async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
  const page = await context.newPage();
  try {
    const response = await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
    assert.equal(response?.status(), 200, "homepage must load");
    await page.getByText("免费创建演示", { exact: true }).first().waitFor({ state: "visible" });
    const bodyText = await page.locator("body").innerText();
    assert.match(bodyText, /工作方式|模板/);
    assert.match(bodyText, /案例|定价/);
    assert.match(bodyText, /FAQ|常见问题/);
    assert.match(bodyText, /隐私|条款|法律/);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    assert.equal(overflow, false, "mobile homepage must not overflow horizontally");
  } finally {
    await context.close();
  }
}, { timeout: 90_000 });

test("P3 primary CTA reaches a project creation route", async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  try {
    const response = await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
    assert.equal(response?.status(), 200, "homepage must load");
    await page.evaluate(() => {
      const scene = document.querySelector("[aria-label*='五幕']");
      if (scene) window.scrollTo(0, scene.offsetTop + scene.offsetHeight - window.innerHeight);
    });
    await page.waitForTimeout(250);
    const cta = page.getByRole("link", { name: /免费创建演示/ }).first();
    await cta.waitFor({ state: "visible" });
    await cta.click();
    await page.waitForLoadState("domcontentloaded").catch(() => {});
    const destination = new URL(page.url());
    assert.ok(
      /^\/projects(?:\/|$)/.test(destination.pathname) || destination.searchParams.get("view") === "create",
      "primary CTA must lead to project creation/workbench routing",
    );
  } finally {
    await context.close();
  }
}, { timeout: 90_000 });
