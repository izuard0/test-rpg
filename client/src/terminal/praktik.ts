// Klien terminal praktik MySQL di server (/api/praktik/*). Bila server MySQL tidak ada
// atau tidak terjangkau, terminal memakai sql.js di browser (cadangan).

import type { SqlStatementResult } from "@mita/shared";
import { net, serverUrl } from "../net/net";

export interface PraktikRun {
  statements: SqlStatementResult[];
  db?: string | null;
  databases?: string[];
  notice?: string;
  ok?: boolean;
  reason?: string;
}

export class PraktikFail extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

let info: Promise<boolean> | undefined;
let beacon = false;

/** Apakah server punya MySQL praktik (dicek sekali per muat halaman). */
export function praktikAvailable(): Promise<boolean> {
  return (info ??= fetch(`${serverUrl()}/api/praktik/info`)
    .then((r) => r.json() as Promise<{ mysql?: boolean }>)
    .then((j) => !!j.mysql)
    .catch(() => false));
}

export async function praktikCall(path: string, body: unknown = {}): Promise<PraktikRun> {
  // Tab ditutup / dimuat ulang: sesi MySQL diakhiri (semua database praktik kembali ke nol).
  if (!beacon) {
    beacon = true;
    addEventListener("pagehide", () => {
      const token = net.token;
      if (token) navigator.sendBeacon(`${serverUrl()}/api/praktik/end`, new Blob([token], { type: "text/plain" }));
    });
  }
  let res: Response;
  try {
    res = await fetch(`${serverUrl()}${path}`, {
      method: "POST",
      headers: { ...net.authHeaders(), "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new PraktikFail("Tidak bisa menghubungi server.", 0);
  }
  const data = (await res.json().catch(() => ({}))) as PraktikRun & { error?: string };
  if (!res.ok) throw new PraktikFail(data.error ?? `Gagal (${res.status}).`, res.status);
  return data;
}
