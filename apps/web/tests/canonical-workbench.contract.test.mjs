import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("the protected root keeps the complete workbench while staged routes stay additive", async () => {
  const source = await read("app/page.tsx");
  assert.match(source, /type View = "home" \| "projects" \| "create" \| "blueprint" \| "studio" \| "editor" \| "quality" \| "delivery"/);
  assert.match(source, /type Deck|baseSlides/);
  assert.match(source, /function Blueprint|function Studio|function Editor|function Quality|function Delivery/);
  assert.match(source, /fetch\(`\$\{apiBase\}\/api\/projects`/);
  assert.match(source, /projectHref\(record\.id,stage/);
  assert.match(source, /projectHref\(project\.id,"brief"\)/);
  assert.match(source, /\/questions|\/blueprint|\/generate/);
});

test("the canonical brief confirms at most three answers before creating an outline", async () => {
  const source = await read("components/project-data/project-route-shell.tsx");
  assert.match(source, /\/questions/);
  assert.match(source, /\.slice\(0, 3\)/);
  assert.match(source, /project\.brief\.answers/);
  assert.match(source, /\/blueprint/);
  assert.match(source, /确认答案并建立蓝图/);
  assert.match(source, /if \(!project\.outline\.length\)/);
  assert.match(source, /先在需求阶段确认追问答案/);
});

test("project routes normalize to the canonical staged URL", async () => {
  const projectPage = await read("app/projects/[projectId]/page.tsx");
  const stagePage = await read("app/projects/[projectId]/[stage]/page.tsx");
  assert.match(projectPage, /redirect\(projectHref\(projectId, "brief"\)\)/);
  assert.match(stagePage, /stage !== resolvedStage/);
  assert.match(stagePage, /redirect\(projectHref\(projectId, resolvedStage\)\)/);
});

test("the canonical editor renders PresentationDocument elements and exposes honest states", async () => {
  const source = await read("components/project-data/project-route-shell.tsx");
  assert.match(source, /function PresentationSlide/);
  assert.match(source, /PresentationElementView/);
  assert.match(source, /project\.generationStale/);
  assert.match(source, /还没有可编辑页面/);
  assert.match(source, /分享链接尚未接入当前项目/);
  assert.match(source, /布局切换尚未接入当前文档/);
  assert.match(source, /function WorkflowFeed/);
});
