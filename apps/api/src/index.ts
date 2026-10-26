import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";
import { pathToFileURL } from "node:url";
import { createApi } from "./runtime.js";

export * from "./contracts.js";
export * from "./commercial/config.js";
export * from "./commercial/service.js";
export * from "./commercial/types.js";
export * from "./creator/messages.js";
export * from "./billing/provider.js";
export * from "./billing/mock-provider.js";
export * from "./db/pglite-store.js";
export * from "./db/schema.js";
export * from "./export/pptx-exporter.js";
export * from "./export/html-exporter.js";
export * from "./export/slide-renderer.js";
export * from "./export/template-pptx-adapter.js";
export * from "./jobs/processor.js";
export * from "./model/index.js";
export * from "./runtime.js";
export * from "./resources/index.js";
export * from "./storage/object-store.js";
export * from "./workflow/types.js";
export * from "./workflow/model-router.js";
export * from "./workflow/presentation-workflow.js";

async function main(): Promise<void> {
  const envFile = resolve(process.env.INIT_CWD ?? process.cwd(), ".env");
  if (existsSync(envFile)) loadEnvFile(envFile);
  const app = await createApi({ logger: true });
  const port = Number(process.env.PORT ?? 8787);
  await app.listen({ host: process.env.HOST ?? "0.0.0.0", port });
}

const entry = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === entry) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
