import { existsSync } from "node:fs";
import { chromium, type Browser, type Page } from "playwright-core";

const candidates = [
  process.env.PLAYWRIGHT_EXECUTABLE_PATH,
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "/usr/bin/microsoft-edge",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].filter((value): value is string => Boolean(value));

export async function launchRenderBrowser(): Promise<Browser> {
  const executablePath = candidates.find(existsSync);
  if (!executablePath) throw new Error("未找到 Edge/Chromium。请设置 PLAYWRIGHT_EXECUTABLE_PATH。");
  return chromium.launch({ executablePath, headless: true });
}

export async function waitForSlideAssets(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(Array.from(document.images).map((image) => image.complete ? Promise.resolve() : new Promise<void>((resolve) => {
      image.addEventListener("load", () => resolve(), { once: true });
      image.addEventListener("error", () => resolve(), { once: true });
    })));
  });
}
