#!/bin/sh
# Titik masuk kontainer: terapkan migrasi database (bila DATABASE_URL diatur), lalu jalankan server.
set -e
if [ -n "$DATABASE_URL" ]; then
  (cd server && npx --no-install prisma migrate deploy)
else
  echo "DATABASE_URL belum diatur: akun disimpan di memori (hilang saat kontainer dimulai ulang)."
fi
exec node server/dist/index.js
