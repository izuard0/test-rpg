// Menjalankan kode di Web Worker dengan batas waktu. Worker yang melewati batas
// dimatikan dan dibuat ulang; perulangan tak berhingga hanya menghentikan terminal.

import type { RunResult } from "@mita/shared";
import type { PseudoRequest } from "./pseudo.worker";
import type { SqlRequest, SqlResponse } from "./sql.worker";

export const TIME_LIMIT_MS = 3000;

class WorkerRunner<Req, Res> {
  private worker?: Worker;
  private seq = 0;
  constructor(private readonly make: () => Worker) {}

  run(req: Req, limitMs = TIME_LIMIT_MS): Promise<{ timeout: true } | { timeout: false; value: Res }> {
    const w = (this.worker ??= this.make());
    const id = ++this.seq;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        w.terminate();
        this.worker = undefined;
        resolve({ timeout: true });
      }, limitMs);
      const onMsg = (e: MessageEvent<{ id: number } & Record<string, unknown>>) => {
        if (e.data.id !== id) return;
        clearTimeout(timer);
        w.removeEventListener("message", onMsg);
        resolve({ timeout: false, value: (e.data.result ?? e.data.res) as Res });
      };
      w.addEventListener("message", onMsg);
      w.postMessage({ id, req });
    });
  }
}

export const pseudoRunner = new WorkerRunner<PseudoRequest, RunResult>(
  () => new Worker(new URL("./pseudo.worker.ts", import.meta.url), { type: "module" }),
);

// SQL pertama kali memuat sql.js (± 1 MB WebAssembly): batas waktu pertama lebih longgar.
let sqlWarm = false;
const sqlInner = new WorkerRunner<SqlRequest, SqlResponse>(
  () => new Worker(new URL("./sql.worker.ts", import.meta.url), { type: "module" }),
);
export const sqlRunner = {
  async run(req: SqlRequest) {
    const r = await sqlInner.run(req, sqlWarm ? TIME_LIMIT_MS : 20000);
    if (!r.timeout) sqlWarm = true;
    else sqlWarm = false;
    return r;
  },
};
