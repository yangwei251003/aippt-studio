import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));
const webRoot = path.join(repositoryRoot, "apps", "web");
const reducedMotionScreenshot = path.join(
  repositoryRoot,
  "output",
  "visual-directions-round-1",
  "screens",
  "a-reduced-motion-1440x1024.png",
);
const boardScreenshotNames = {
  a: "a-river-field-board.png",
  b: "b-page-stage-board.png",
  c: "c-agent-field-board.png",
};
const requireFromWeb = createRequire(path.join(webRoot, "package.json"));
const { chromium } = requireFromWeb("playwright-core");

let browser;
let server;
let serverOutput = "";
let baseUrl = process.env.AIPPT_E2E_BASE_URL?.replace(/\/$/, "");

function rememberServerOutput(chunk) {
  serverOutput = `${serverOutput}${chunk}`.slice(-8_000);
}

async function serverIsReady(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });
    return response.ok && (response.headers.get("x-powered-by") === "Next.js" || (await response.text()).includes("AIPPT"));
  } catch {
    return false;
  }
}

async function waitForServer(url, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (server?.exitCode !== null) throw new Error(`Web server exited before becoming ready.\n${serverOutput}`);
    if (await serverIsReady(url)) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${url}.\n${serverOutput}`);
}

before(async () => {
  if (!baseUrl) {
    const existingUrl = "http://127.0.0.1:3000";
    if (await serverIsReady(existingUrl)) {
      baseUrl = existingUrl;
    } else {
      const port = Number(process.env.AIPPT_E2E_PORT ?? 42_000 + Math.floor(Math.random() * 1_000));
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

async function layoutAudit(page) {
  return page.evaluate(() => ({
    viewportWidth: document.documentElement.clientWidth,
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth,
    visibleDash: /[—–]/.test(document.body.innerText),
    zeroSizedExports: [...document.querySelectorAll("[data-export]")]
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width === 0 || rect.height === 0;
      })
      .map((element) => element.getAttribute("data-export")),
  }));
}

test("default overview exposes exactly three visual directions and stays noindex", async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1024 } });
  const page = await context.newPage();
  try {
    const response = await page.goto(`${baseUrl}/visual-directions`, { waitUntil: "domcontentloaded" });
    assert.equal(response?.status(), 200);
    assert.equal(await page.getByRole("link", { name: "查看完整方向" }).count(), 3);
    assert.match(await page.locator('meta[name="robots"]').getAttribute("content"), /noindex/);
    const layout = await layoutAudit(page);
    assert.ok(Math.max(layout.documentWidth, layout.bodyWidth) <= layout.viewportWidth + 2, JSON.stringify(layout));
    assert.equal(layout.visibleDash, false);
  } finally {
    await context.close();
  }
});

test("exports three complete 2560px boards without remote visual resources", async () => {
  const context = await browser.newContext({ viewport: { width: 2560, height: 1440 } });
  const page = await context.newPage();
  try {
    for (const direction of ["a", "b", "c"]) {
      const response = await page.goto(`${baseUrl}/visual-directions?direction=${direction}`, { waitUntil: "domcontentloaded" });
      assert.equal(response?.status(), 200);
      await page.evaluate(async () => {
        for (let y = 0; y < document.documentElement.scrollHeight; y += 900) {
          window.scrollTo(0, y);
          await new Promise((resolve) => requestAnimationFrame(() => resolve()));
        }
        window.scrollTo(0, 0);
        await document.fonts.ready;
        await Promise.all([...document.images].map((image) => {
          if (image.complete) return undefined;
          return new Promise((resolve) => {
            image.addEventListener("load", resolve, { once: true });
            image.addEventListener("error", resolve, { once: true });
          });
        }));
      });
      assert.equal(await page.evaluate(() => [...document.images].every((image) => image.complete && image.naturalWidth > 0)), true);
      assert.deepEqual(
        await page.evaluate(() => [...document.images]
          .map((image) => new URL(image.currentSrc || image.src, location.href))
          .filter((url) => url.origin !== location.origin)
          .map((url) => url.href)),
        [],
      );
      await page.screenshot({
        animations: "disabled",
        fullPage: true,
        path: path.join(repositoryRoot, "output", "visual-directions-round-1", boardScreenshotNames[direction]),
      });
    }
  } finally {
    await context.close();
  }
}, { timeout: 120_000 });

for (const viewport of [
  { name: "desktop", width: 1440, height: 1024 },
  { name: "mobile", width: 390, height: 844 },
]) {
  test(`${viewport.name}: A, B and C boards keep all eleven modules inside the viewport`, async () => {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    const failures = [];
    try {
      for (const direction of ["a", "b", "c"]) {
        try {
          const response = await page.goto(`${baseUrl}/visual-directions?direction=${direction}`, { waitUntil: "domcontentloaded" });
          assert.equal(response?.status(), 200);
          assert.equal(await page.locator(`[data-direction="${direction}"]`).count(), 1);
          assert.equal(await page.locator("[data-module]").count(), 11);
          await page.evaluate(async () => {
            window.scrollTo(0, document.documentElement.scrollHeight);
            await document.fonts.ready;
          });
          const layout = await layoutAudit(page);
          assert.ok(Math.max(layout.documentWidth, layout.bodyWidth) <= layout.viewportWidth + 2, JSON.stringify(layout));
          assert.deepEqual(layout.zeroSizedExports, []);
          assert.equal(layout.visibleDash, false);
        } catch (error) {
          failures.push(`${direction}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      assert.deepEqual(failures, []);
    } finally {
      await context.close();
    }
  }, { timeout: 90_000 });
}

test("reduced motion, keyboard focus and the official home remain available", async () => {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1024 },
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  try {
    let response = await page.goto(`${baseUrl}/visual-directions?direction=a`, { waitUntil: "domcontentloaded" });
    assert.equal(response?.status(), 200);
    assert.equal(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches), true);
    await page.screenshot({ path: reducedMotionScreenshot });
    await page.keyboard.press("Tab");
    assert.match(await page.evaluate(() => document.activeElement?.tagName ?? ""), /^(A|BUTTON|INPUT|TEXTAREA)$/);

    response = await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded" });
    assert.equal(response?.status(), 200);
    assert.ok((await page.locator("body").innerText()).includes("AIPPT"));
  } finally {
    await context.close();
  }
});
