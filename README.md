# Virtual Class · Gedung Prodi Informatika

Game RPG 2D pixel berbasis browser yang menggambarkan gedung Prodi Informatika:
satu lobi (maks. 100 orang), perpustakaan digital dengan terminal praktik
(SQL, Python, pseudocode), dan tiga kelas (30 / 45 / 60 kursi) untuk kuis.
Mahasiswa membuat karakter sendiri saat registrasi.

Rancangan lengkap dan keputusan yang sudah disepakati ada di
[`docs/RANCANGAN.md`](docs/RANCANGAN.md). Mulai membaca dari sana.

## Status

| Bagian | Kondisi |
|---|---|
| Rancangan, tech stack, aturan chat, login | Selesai (lihat `docs/RANCANGAN.md`) |
| Prototipe karakter (gerak, kamera, kustomisasi) | Selesai: `prototype/karakter/index.html` |
| Aset tile (lobi, perpustakaan, kelas) | Sudah diolah jadi 339 sprite transparan (`export/tiles/`); petak game **28 px** (diputuskan; temuan skala di `docs/TILES.md`) |
| Aset NPC, ikon, dua latar layar | Belum dibuat (lihat `belum-dibuat/`) |
| Peta `kampus` (denah gedung) dan `kelas-a/b/c` | Dibuat dan divalidasi lewat skrip; **belum dibuka di Tiled/Phaser** |
| Klien Phaser satu pemain (`client/`) | **Berjalan**: halaman awal, daftar/masuk (mode uji, akun di browser), kreator avatar, peta Tiled asli, gerak + tabrakan, interaksi `E` (rak, terminal penampung, NPC, pintu ke kelas, kursi) |
| Server (`server/`) | Fastify menyajikan klien + `/health`; Colyseus, API login, dan PostgreSQL belum |
| Terminal, kuis | Belum dimulai |

Pengembangan dilanjutkan di repositori ini, dimulai dari tahap 1 pada
`docs/RANCANGAN.md` bagian 7.

## Mulai cepat

Lihat prototipe karakter tanpa memasang apa pun: buka
`prototype/karakter/index.html` di browser (klik dua kali).

Menjalankan ulang pemrosesan aset karakter (butuh Python 3.12):

```bash
pip install -r requirements.txt
python tools/process_character.py   # gambar mentah -> atlas (± 1 menit)
python tools/build_sim.py           # bangun ulang halaman prototipe
python tools/export_character.py    # paket karakter ke export/character/
python tools/process_tiles.py       # lembar tile -> sprite transparan (± 12 detik)
python tools/process_outdoor.py     # lembar luar ruangan -> sprite
python tools/process_items.py       # sheet ikon/lencana/emote -> 68 sprite di export/ui/items/
python tools/make_map.py kampus     # peta Tiled + pratinjau di maps/ (juga: kelas-a, kelas-b, kelas-c)
```

### Menjalankan game (butuh Node 22+)

```bash
npm install
npm run dev          # klien di http://localhost:5173 (aset disalin otomatis)
npm test             # tes tabrakan, peta, karakter, akun, server
npm run build && npm start   # versi produksi di http://localhost:3000
```

Tambahkan `?debug=1` di alamat untuk melihat kotak tabrakan (merah) dan interaksi (cyan).
Akun di tahap ini **mode uji**: tersimpan di browser saja, belum diverifikasi ke daftar kelas.

### Deploy (Coolify)

Buat aplikasi dari repo ini dengan build pack **Dockerfile**, port **3000**, health check
`/health`. Tidak ada environment variable wajib untuk tahap ini (opsional: `APP_VERSION`).

## Struktur folder

```
assets/
  characters/raw/   gambar mentah dari Gemini (sumber pemrosesan, jangan diedit)
  characters/base/  badan dasar acuan gaya
  tiles/            lobi, perpustakaan, kelas (+ _draft/ untuk draf lama)
  backgrounds/      layar judul
asset-prompts/      prompt pembuatan aset; karakter-hemat/ = kotak masuk gambar baru
belum-dibuat/       daftar aset yang belum dibuat + gambar acuan
client/             klien Phaser + UI HTML (Vite, TypeScript)
server/             server Fastify (kelak + Colyseus dan API)
shared/             logika bersama klien & server (tabrakan, peta, aturan karakter & akun)
materi/             materi.json + file materi HTML untuk rak perpustakaan
docs/               RANCANGAN.md dan dokumen teknis
export/character/   paket karakter siap pakai untuk klien (dihasilkan; docs/KARAKTER.md)
export/tiles/       sprite tile transparan hasil olahan (dihasilkan; docs/TILES.md)
export/ui/items/    68 ikon, lencana, emote transparan (dihasilkan; sprites_hd = penuh, sprites = 1x)
maps/               peta Tiled (.tmj), set tile, dan pratinjau (dihasilkan; docs/PETA.md)
prototype/karakter/ prototipe karakter (dibangun otomatis, jangan diedit tangan)
tools/              skrip pemroses aset dan pembuat prototipe
```

## Panduan untuk pengembang dan asisten AI

Konvensi, jebakan yang sudah ditemui, dan cara kerja alur aset ada di
[`CLAUDE.md`](CLAUDE.md).
