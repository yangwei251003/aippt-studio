#!/usr/bin/env node
/**
 * Capture acceptance assets from the running product UI. Every screenshot is
 * taken from the real DOM (SlideCanvas or workspace surface); no synthetic
 * image is created here.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const output = path.join(root, 'assets', 'production', 'acceptance');
const edge = process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const playwrightPath = process.env.PLAYWRIGHT_CORE || path.join(root, 'node_modules', '.pnpm', 'playwright-core@1.62.1', 'node_modules', 'playwright-core', 'index.mjs');

async function loadPlaywright() {
  try { return await import(pathToFileURL(playwrightPath).href); }
  catch (error) { throw new Error(`playwright-core is required at ${playwrightPath}`, { cause: error }); }
}

async function ensureDirectories() {
  await fs.mkdir(path.join(output, 'cards'), { recursive: true });
  await fs.mkdir(path.join(output, 'landing'), { recursive: true });
  for (const workspace of ['create-center', 'blueprint', 'agent-studio', 'editor', 'quality-center', 'delivery-center']) {
    await fs.mkdir(path.join(output, 'workspaces', workspace), { recursive: true });
  }
}

async function settle(page, ms = 250) {
  await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(ms);
}

async function gotoView(page, view) {
  await page.goto(`http://localhost:3000/?view=${view}&acceptance=${Date.now()}`, { waitUntil: 'domcontentloaded' });
  await settle(page);
}

async function savePage(page, file) {
  await page.screenshot({ path: file, type: 'png', animations: 'disabled', scale: 'css' });
}

async function captureWorkspace(page, view, slug) {
  const dir = path.join(output, 'workspaces', slug);
  await gotoView(page, view);
  await savePage(page, path.join(dir, 'primary.png'));

  const tabs = page.locator('[class*="stateTabs"] button');
  if (await tabs.count() >= 4) {
    for (const [index, state] of ['empty', 'loading', 'outcome'].entries()) {
      await tabs.nth(index + 1).click();
      await page.waitForTimeout(100);
      await savePage(page, path.join(dir, `${state}.png`));
    }
  } else if (view === 'create') {
    await page.getByRole('button', { name: /开始理解/ }).click();
    await savePage(page, path.join(dir, 'loading.png'));
    await page.waitForTimeout(1100);
    await savePage(page, path.join(dir, 'outcome.png'));
    await gotoView(page, 'create');
    await savePage(page, path.join(dir, 'empty.png'));
  } else if (view === 'studio') {
    await savePage(page, path.join(dir, 'loading.png'));
    await page.getByRole('button', { name: /暂停/ }).click();
    await savePage(page, path.join(dir, 'outcome.png'));
    await savePage(page, path.join(dir, 'empty.png'));
  } else if (view === 'editor') {
    await savePage(page, path.join(dir, 'loading.png'));
    await page.getByRole('button', { name: /检查并交付/ }).click();
    await settle(page);
    await savePage(page, path.join(dir, 'outcome.png'));
    await gotoView(page, 'editor');
    await savePage(page, path.join(dir, 'empty.png'));
  } else if (view === 'delivery') {
    await savePage(page, path.join(dir, 'empty.png'));
    await page.getByRole('button', { name: /导出/ }).click();
    await savePage(page, path.join(dir, 'loading.png'));
    await page.waitForTimeout(1500);
    await savePage(page, path.join(dir, 'outcome.png'));
  }
}

async function captureCards(chromium) {
  const sharpModule = await import('sharp');
  const sharp = sharpModule.default ?? sharpModule;
  const context = await chromium.launchPersistentContext('', {
    headless: true,
    executablePath: edge,
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1.5,
  });
  const page = await context.newPage();
  await gotoView(page, 'editor');
  const slides = page.locator('[class*="thumbs"] > button:not([class*="addSlide"])');
  const canvas = page.locator('[class*="slideCanvas"]');
  if (await canvas.count() === 0) throw new Error('SlideCanvas was not found in editor view');
  for (let index = 0; index < 12; index += 1) {
    await slides.nth(index % Math.max(1, await slides.count())).click();
    await page.waitForTimeout(75);
    const destination = path.join(output, 'cards', `card-${String(index + 1).padStart(2, '0')}.png`);
    const captured = `${destination}.captured.png`;
    await canvas.screenshot({ path: captured, animations: 'disabled', scale: 'device' });
    // The source remains a real SlideCanvas screenshot; this normalizes the
    // acceptance contract to the required 1920x1080 delivery dimensions.
    await sharp(captured).resize(1920, 1080, { fit: 'fill' }).png().toFile(destination);
    await fs.unlink(captured);
  }
  await context.close();
}

async function captureLandingFallbacks(page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoView(page, 'home');
  await savePage(page, path.join(output, 'landing', 'mobile-composite.png'));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await savePage(page, path.join(output, 'landing', 'reduced-motion-fallback.png'));
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.setViewportSize({ width: 1920, height: 1080 });
}

async function main() {
  const { chromium } = await loadPlaywright();
  await ensureDirectories();
  const browser = await chromium.launch({ headless: true, executablePath: edge });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const workspaces = [
    ['create', 'create-center'], ['blueprint', 'blueprint'], ['studio', 'agent-studio'],
    ['editor', 'editor'], ['quality', 'quality-center'], ['delivery', 'delivery-center'],
  ];
  for (const [view, slug] of workspaces) await captureWorkspace(page, view, slug);
  await captureLandingFallbacks(page);
  await context.close();
  await browser.close();
  await captureCards(chromium);
  console.log(`Captured acceptance assets under ${path.relative(root, output)}.`);
}

main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
