// Konfigurasi Prisma CLI (generate, migrate). Alamat database dari env DATABASE_URL.
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  // `prisma generate` tidak butuh database, jadi boleh kosong saat build.
  datasource: { url: process.env.DATABASE_URL ?? "" },
});
