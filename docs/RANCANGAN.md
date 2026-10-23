# Rancangan Project Virtual Class

Dokumen ini merangkum keputusan desain dan teknis yang sudah disepakati.
Bagian **Keputusan terbuka** di akhir berisi hal yang masih perlu diputuskan.

Terakhir diperbarui: 23 Oktober 2026

---

## 1. Ringkasan

Game RPG 2D pixel berbasis browser yang menggambarkan **gedung Prodi Informatika**.
Mahasiswa membuat karakter sendiri, lalu belajar, mengerjakan kuis, dan nongkrong
bersama secara daring.

| Ruangan | Kapasitas | Fungsi |
|---|---|---|
| Lobi | maks. 100 orang | Tempat nongkrong, titik muncul pemain, papan peringkat dan pengumuman |
| Perpustakaan Digital | — | Belajar mandiri: rak buku memunculkan daftar materi HTML; terminal untuk praktik SQL, Python, dan pseudocode (lihat bagian 5) |
| Kelas A · Lab Komputer | 30 kursi | Kuis individu, latihan |
| Kelas B · Ruang Kolaborasi | 45 kursi (9 meja kelompok × 5) | Kuis tim, diskusi kelompok |
| Kelas C · Auditorium | 60 kursi (bertingkat) | Kuis besar, kuliah umum |

Usulan nama ruangan (belum final): Perpustakaan Al-Khawarizmi, Lab Lovelace,
Ruang Kolaborasi, Auditorium Turing.

---

## 2. Tema visual

**"Kampus teknologi yang hangat."** Unsur informatika muncul di perabot dan detail
(monitor, rak server, pola sirkuit halus, papan tulis berisi diagram), bukan lewat
warna neon. Latar tetap terang dan tenang karena pemain akan membaca materi lama.

- Palet: navy `#1B2A41`, abu batu `#4F5D6E`, krem `#F7F5F0`, kayu `#9C6B43`,
  oranye `#E8833A` (sorotan & interaksi), cyan `#3FC1C9` (khusus layar),
  hijau terminal `#6CC3A2` (detail kecil). Sama dengan palet slide HTML.
- Benda yang bisa diinteraksi menyala **oranye** saat didekati.
- UI meniru alat kerja programmer: dialog = jendela terminal,
  daftar materi = penjelajah file, kuis = editor kode.
- Maskot: **bebek karet** (rujukan *rubber duck debugging*) sebagai pemandu.
- Spesifikasi aset: petak 32×32 px, karakter 32×48 px, 4 arah × 3 frame.
  Detail lengkap ada di `asset-prompts/`.

---

## 3. Tech stack

| Bagian | Pilihan | Alasan |
|---|---|---|
| Bahasa | TypeScript (klien & server) — **disepakati** | Klien wajib JS/TS; Colyseus hanya ada di Node.js; penerjemah pseudocode, aturan chat, dan pemeriksaan kuis ditulis sekali lalu dipakai di klien & server. Python bisa ditambahkan kelak sebagai layanan terpisah untuk analitik/AI |
| Mesin game | Phaser 3 | Mesin game 2D browser yang matang; tilemap, sprite, sentuh layar |
| Pembuat peta | Tiled | Peta digambar visual, disimpan sebagai JSON; titik interaksi ditandai di peta |
| Panel UI | HTML/CSS di atas kanvas | Teks, formulir, daftar materi, dan kuis lebih rapi dengan HTML |
| Materi | File HTML yang sudah ada + `materi.json` | Slide tidak perlu diubah; dibuka di panel/iframe atau tab baru |
| Editor kode (terminal) | CodeMirror 6 | Editor ringan dengan pewarnaan sintaks, nyaman di laptop dan HP |
| SQL di browser | sql.js (SQLite via WebAssembly) | Matang dan kecil; tiap mahasiswa punya database sendiri |
| Python di browser | Pyodide | Python sungguhan di browser; dimuat hanya saat terminal Python dibuka |
| Pseudocode | Penerjemah buatan sendiri | Mengikuti notasi slide (`←`, `for … endfor`, `repeat … until`) + tabel jejak |
| Isolasi eksekusi | Web Worker + batas waktu | Perulangan tak berhingga hanya menghentikan terminal, game tetap jalan |
| Multipemain | Colyseus (Node.js) | Berbasis *room* yang sesuai dengan ruangan; batas kapasitas & sinkronisasi bawaan |
| API | Fastify | Login, materi, bank soal, nilai, ekspor CSV/Excel |
| Database | PostgreSQL + Prisma | Akun, karakter, soal, nilai, laporan chat |
| Server | 1 VPS (± 2 CPU, 4 GB RAM), Docker, HTTPS/WSS | Beban 100 pemain (posisi + chat) ringan |

### Arsitektur

```
 Browser (laptop / HP)                         Server
┌───────────────────────────────┐        ┌──────────────────────────────┐
│ Phaser 3  -> dunia game       │  wss   │ Colyseus (Node.js)           │
│   peta, karakter, gerak       │◄──────►│   LobbyRoom     maks 100     │
│ HTML/CSS  -> panel UI         │        │   LibraryRoom                │
│   dialog, daftar materi,      │        │   ClassRoom     maks 30/45/60│
│   kuis, kreator karakter      │  https │ API (Fastify)                │
│ iframe    -> materi HTML      │◄──────►│   login, materi, nilai, CSV  │
└───────────────────────────────┘        │ PostgreSQL                   │
          Tiled -> peta (JSON)           └──────────────────────────────┘
```

### Struktur folder (rencana)

```
project-virtualclass/
  asset-prompts/   prompt pembuatan aset
  assets/          aset gambar (PNG)
  client/          Phaser + UI HTML
  server/          Colyseus + Fastify
  shared/          tipe data bersama klien & server
  maps/            peta Tiled (.tmj)
  materi/          file materi HTML + materi.json
  latihan/         soal latihan terminal (SQL, Python, pseudocode) + dataset
  docs/            dokumen rancangan (file ini)
```

### Karakter kustom

Karakter disusun dari lapisan (badan, rambut, baju, bawahan, sepatu, hijab/topi,
aksesori). Yang disimpan di database hanya pilihan pemain, misalnya:

```json
{ "body": "base_02", "hair": "hair_long", "hairColor": "#3B2A20",
  "top": "top_hoodie", "topColor": "#2F6FB0", "bottom": "bottom_jeans",
  "shoes": "shoes_sneakers", "head": null, "accessories": ["acc_glasses_square"] }
```

Gambar disusun di browser masing-masing. Rambut dan pakaian berwarna abu-abu
lalu diwarnai oleh game, sehingga satu aset menghasilkan banyak pilihan warna.

### Data yang disimpan (garis besar)

| Tabel | Isi |
|---|---|
| `users` | akun, nama tampilan, peran (mahasiswa / dosen / asisten) |
| `characters` | pilihan karakter (JSON di atas) |
| `courses`, `materials` | mata kuliah dan daftar materi (atau cukup `materi.json`) |
| `quizzes`, `questions` | bank soal |
| `quiz_sessions`, `answers` | kuis yang dijalankan dan jawaban mahasiswa |
| `chat_reports` | hanya pesan yang dilaporkan (lihat bagian 4) |
| `exercise_progress` | latihan terminal yang sudah diselesaikan mahasiswa |
| `code_saves` | kode terakhir mahasiswa per latihan / per mode sandbox (teks kecil) |

Isi chat biasa **tidak** disimpan.

---

## 4. Chat

### Prinsip penyimpanan

- Server **hanya meneruskan** pesan ke penerima yang berhak; pesan tidak ditulis
  ke database.
- Server boleh menyimpan ± 50 pesan terakhir per ruangan **di memori** agar pemain
  yang baru masuk melihat obrolan yang sedang berlangsung. Hilang saat ruangan
  kosong atau server dimulai ulang.
- Di browser, riwayat disimpan **di memori selama tab terbuka**, tidak di
  `localStorage`, karena komputer lab dipakai bergantian.
- Sejalan dengan prinsip minimisasi data (UU Pelindungan Data Pribadi).

### Empat mode chat

Pesan tampil sebagai **gelembung di atas kepala** karakter dan di kotak chat.

| Mode | Penerima | Yang dilihat pemain lain | Warna |
|---|---|---|---|
| Sekitar (bawaan) | Pemain dalam radius tertentu (dalam **petak**, bukan piksel) | "…" bagi yang di luar radius | putih |
| Publik | Semua orang di ruangan | Isi pesan | biru |
| Berdua | Satu pemain yang dipilih | Ikon gembok | oranye |
| Kelompok | Anggota kelompok, berapa pun jaraknya | "…" | hijau |

Kelompok terbentuk dengan tiga cara: otomatis per meja di Ruang Kolaborasi,
dibagi oleh dosen, atau ajakan antarmahasiswa.

### Aturan per ruangan

| Ruangan | Sekitar | Publik | Berdua | Kelompok |
|---|---|---|---|---|
| Lobi | ✔ bawaan, radius 5 petak | dibatasi | ✔ | ✔ |
| Perpustakaan | ✔ radius 3 petak | ✘ (ruang tenang) | ✔ | ✔ |
| Kelas (bukan kuis) | ✔ | ✔ | ✔ | ✔ bawaan di Kelas B |
| Kelas (saat kuis) | ✘ | dosen saja | ✘ | ✘ |

"Dibatasi" di lobi: misalnya 1 pesan per 10 detik, atau hanya dosen/asisten
(untuk pengumuman). Angka final ditentukan saat uji coba.

### Detail perilaku

- Lingkaran radius tipis tampil di lantai saat mode Sekitar aktif.
- Ganti mode dengan satu tombol di samping kotak ketik; pintasan: `Tab`
  (ganti mode), `/w nama` (Berdua), `/g` (Kelompok).
- **Penyaringan penerima dilakukan di server.** Pesan Berdua/Kelompok tidak
  pernah dikirim ke pemain lain, sehingga tidak bisa dibaca lewat *developer tools*.

### Pengaman

- Batas kirim: ± 1 pesan per detik, maks. 200 karakter.
- Saringan kata kasar (bahasa Indonesia & Inggris).
- Tombol **bisukan** (setiap pemain) dan bisukan paksa oleh dosen di ruangannya.
- Tombol **laporkan**: lihat Keputusan terbuka no. 1.

---

## 5. Terminal perpustakaan

Terminal di Perpustakaan Digital untuk **praktik langsung**. Pemain mendekati
terminal, terminal menyala oranye, lalu terbuka panel penuh: daftar latihan di
kiri (gaya penjelajah file), editor kode di atas, hasil di bawah.

### Keputusan

- **Semua kode dijalankan di browser mahasiswa**, tidak di server.
  Aman (kerusakan hanya berdampak pada sesi sendiri), tidak membebani server,
  dan tetap lancar walau 100 mahasiswa praktik bersamaan.
- **Tiga mode bahasa**: SQL, Python, dan pseudocode.
- **SQL umum**, bukan MySQL persis. Mesin: SQLite (sql.js). Untuk SELECT,
  JOIN, GROUP BY, subquery, dan DDL dasar, perbedaan dengan MySQL kecil.
- **Dua cara pakai**: sandbox bebas dan latihan dengan pemeriksaan otomatis.

### Mode bahasa

| Mode | Mesin | Isi awal |
|---|---|---|
| SQL | sql.js (SQLite) | Database contoh berisi tabel `mahasiswa`, `matakuliah`, `nilai` (dan dataset lain sesuai kebutuhan); bisa direset kapan saja |
| Python | Pyodide | Python standar; pustaka tambahan (mis. pandas) dimuat bila latihan membutuhkannya |
| Pseudocode | Penerjemah buatan sendiri | Notasi Munir (2019) seperti di slide: `read`, `write`, `←`, `if … endif`, `for … endfor`, `while … endwhile`, `repeat … until`, larik |

Fitur khusus pseudocode: jalankan langkah demi langkah dengan **baris aktif
menyala** dan **tabel jejak variabel**, seperti simulasi di slide Minggu 10.

### Sandbox bebas

- Editor kosong (atau berisi contoh) untuk bereksperimen tanpa penilaian.
- Database SQL pribadi yang bisa diubah sesuka hati, dengan tombol **Reset data**.

### Latihan dengan pemeriksaan otomatis

| Mode | Cara memeriksa |
|---|---|
| SQL | Hasil query mahasiswa dibandingkan dengan hasil query kunci (isi baris dan kolom; urutan diabaikan kecuali soal meminta `ORDER BY`) |
| Python | Program dijalankan dengan beberapa masukan uji; keluaran dibandingkan dengan keluaran yang diharapkan |
| Pseudocode | Sama dengan Python: masukan uji -> keluaran yang diharapkan; plus pemeriksaan bahwa program berhenti |

- Latihan ditulis sebagai file data di folder `latihan/` (judul, deskripsi,
  kode awal, kasus uji, kunci), sehingga dosen bisa menambah soal tanpa
  mengubah kode game.
- Latihan yang selesai dicatat ke akun dan bisa memberi **lencana**.
- Kunci jawaban **tidak** dikirim ke browser dalam bentuk yang mudah dibaca
  (yang dikirim hanya hasil yang diharapkan, bukan query/kode kuncinya). Catatan: karena pemeriksaan berjalan di browser, mahasiswa yang
  gigih tetap bisa mengakalinya. Untuk latihan mandiri ini dapat diterima;
  untuk kuis bernilai, pemeriksaan dipindah ke server (tahap berikutnya).

### Pengaman

- Kode berjalan di **Web Worker** dengan **batas waktu** (mis. 3 detik).
  Perulangan tak berhingga menghentikan terminal saja, bukan game.
- Batas jumlah keluaran (mis. 1.000 baris) agar tab tidak macet.
- Python dan pseudocode tidak punya akses jaringan atau berkas di luar sandbox.

### Penyimpanan

- Kode terakhir per latihan disimpan ke **akun** (server), bukan ke
  `localStorage`, karena komputer lab dipakai bergantian.
- Sebelum fitur login ada (tahap prototipe), kode hanya bertahan selama tab terbuka.

### Dipakai ulang

Komponen terminal yang sama dipakai di **Lab Komputer (Kelas A)** untuk kuis
praktik, dengan pemeriksaan di server agar nilainya dapat dipercaya.

---

## 6. Tahapan pengerjaan

1. **Prototipe satu pemain**: peta, gerak, rak buku membuka materi, kreator
   karakter. Belum memakai server. Grafik sementara selama aset belum lengkap.
2. **Terminal perpustakaan**: editor, mode SQL, Python, dan pseudocode,
   sandbox, beberapa latihan contoh. Masih satu pemain, tanpa server.
3. **Multipemain lobi**: saling melihat, pindah ruangan, empat mode chat, emote.
4. **Kuis di kelas**: kursi, panel kuis, halaman dosen untuk memulai kuis
   dan mengunduh nilai; kuis praktik memakai terminal di Lab Komputer.
5. **Login & penyimpanan**: akun, karakter tersimpan, kemajuan latihan, lencana.
6. **Peluncuran**: HTTPS di server, uji coba dengan satu kelas.

---

## 7. Keputusan terbuka

| No | Hal | Pilihan | Status |
|---|---|---|---|
| 1 | Penyimpanan laporan chat | Simpan pesan yang dilaporkan + beberapa pesan sebelumnya, hapus otomatis setelah 7 hari **atau** tanpa penyimpanan sama sekali | belum diputuskan |
| 2 | Karakter kustom | Aset buatan AI sesuai panduan **atau** LPC Character Generator (wajib kredit) | belum diputuskan |
| 3 | Server | Server kampus **atau** sewa VPS | belum diputuskan |
| 4 | Login | SSO/akun kampus **atau** NIM/email + kata sandi | belum diputuskan |
| 5 | Nilai kuis | Hanya di game **atau** bisa diunduh dosen (CSV/Excel) | belum diputuskan |
| 6 | Perangkat utama | Laptop, HP, atau keduanya | belum diputuskan |
| 7 | Perawat kode | Dosen, mahasiswa, atau tim IT kampus (memengaruhi bahasa server) | belum diputuskan |
| 8 | Nama platform & nama ruangan | Ide: Kampus Piksel, Gedung Algoritma, InfoVerse, Ruang Kode | belum diputuskan |
