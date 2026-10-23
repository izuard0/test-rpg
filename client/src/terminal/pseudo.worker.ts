// Web Worker pseudocode: program dijalankan di luar utas game. Bila melewati batas
// waktu, utas utama mematikan worker ini (runner.ts), jadi game tetap jalan.

import { runPseudocode, type RunResult } from "@mita/shared";

export interface PseudoRequest {
  code: string;
  input: string;
  /** Simpan jejak untuk mode langkah demi langkah. */
  trace: boolean;
}

self.onmessage = (e: MessageEvent<{ id: number; req: PseudoRequest }>) => {
  const { id, req } = e.data;
  const result: RunResult = runPseudocode(req.code, { input: req.input, traceLimit: req.trace ? 3000 : 0 });
  self.postMessage({ id, result });
};
