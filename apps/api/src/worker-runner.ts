import { createBackendServices, type BackendOptions } from "./runtime.js";

export interface WorkerOptions extends BackendOptions {
  pollIntervalMs?: number;
  signal?: AbortSignal;
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => { clearTimeout(timer); resolve(); }, { once: true });
  });
}

export async function runWorker(options: WorkerOptions = {}): Promise<void> {
  const services = await createBackendServices(options);
  try {
    while (!options.signal?.aborted) {
      const processed = await services.jobs.processNext();
      if (!processed) await wait(options.pollIntervalMs ?? 750, options.signal);
    }
  } finally {
    await services.close();
  }
}
