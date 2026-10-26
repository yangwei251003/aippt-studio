import { runWorker } from "@aippt/api/worker";

const controller = new AbortController();
process.once("SIGINT", () => controller.abort());
process.once("SIGTERM", () => controller.abort());

runWorker({ signal: controller.signal }).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
