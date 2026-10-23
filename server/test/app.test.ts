import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";

describe("server", () => {
  it("menjawab cek kesehatan dan menyajikan klien", async () => {
    const dir = mkdtempSync(join(tmpdir(), "mita-client-"));
    writeFileSync(join(dir, "index.html"), "<!doctype html><title>MITA</title>");
    const app = await buildApp({ clientDir: dir, version: "uji" });

    const health = await app.inject("/health");
    expect(health.statusCode).toBe(200);
    expect(health.json()).toMatchObject({ status: "ok", version: "uji" });

    const index = await app.inject("/");
    expect(index.statusCode).toBe(200);
    expect(index.body).toContain("MITA");
    expect(index.headers["cache-control"]).toBe("no-cache");
    await app.close();
  });
});
