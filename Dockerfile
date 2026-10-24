# Image aplikasi MITA untuk Coolify: satu image (server + hasil build klien).
# PostgreSQL dipasang terpisah sebagai sumber daya Coolify; migrasi database dijalankan
# otomatis saat kontainer mulai (server/scripts/start.sh).

# ---- build ----
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY client/package.json client/
COPY server/package.json server/prisma.config.ts server/
# Skema dibutuhkan `prisma generate` (postinstall server).
COPY server/prisma server/prisma
RUN npm ci --no-audit --no-fund
# Aset dan peta disalin ke klien oleh client/scripts/sync-assets.mjs saat build.
COPY tsconfig.base.json ./
COPY shared shared
COPY client client
COPY server server
COPY maps maps
COPY export export
COPY bahan_ajar bahan_ajar
COPY latihan latihan
COPY assets/backgrounds assets/backgrounds
RUN npm run build

# ---- runtime ----
# libssl3 bawaan image cukup untuk mesin migrasi Prisma (biner native, linux-musl-openssl-3.0.x).
FROM node:24-alpine
ENV NODE_ENV=production PORT=3000 HOST=0.0.0.0
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY client/package.json client/
COPY server/package.json server/prisma.config.ts server/
# Skema + migrasi: dipakai `prisma migrate deploy` saat kontainer mulai.
COPY server/prisma server/prisma
RUN npm ci --omit=dev --workspace server --include-workspace-root=false --no-audit --no-fund \
 && npm cache clean --force
COPY --from=build /app/server/dist server/dist
COPY server/scripts/start.sh server/scripts/
COPY --from=build /app/client/dist client/dist
# Data peta dan konfigurasi karakter untuk server game (tabrakan, zona chat, kursi).
COPY maps/*.tmj maps/
COPY export/character/config.json export/character/
# Dataset dan soal SQL (beserta kunci) untuk terminal praktik MySQL; kunci tidak dikirim ke browser.
COPY latihan/data latihan/data
COPY latihan/sql latihan/sql
ARG APP_VERSION=dev
ENV APP_VERSION=$APP_VERSION
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/health > /dev/null || exit 1
CMD ["sh", "server/scripts/start.sh"]
