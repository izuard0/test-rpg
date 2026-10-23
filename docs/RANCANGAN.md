# Rancangan Project Virtual Class

Dokumen ini merangkum keputusan desain dan teknis yang sudah disepakati.
Bagian **Keputusan terbuka** di akhir berisi hal yang masih perlu diputuskan.

Terakhir diperbarui: 23 Oktober 2026

**Status terbaru:** prototipe karakter sudah selesai dan berjalan dengan baik
(berjalan 4 arah, kamera, kustomisasi). Ringkasannya ada di **bagian 6**.

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

Proyek saat ini berada di `D:\project-virtualclass\test-rpg\`. Folder bertanda
(ada) sudah dibuat; sisanya masih rencana.

```
test-rpg/
  asset-prompts/   (ada) prompt pembuatan aset
  assets/          (ada) aset gambar; characters/raw/ = hasil mentah dari Gemini
  belum-dibuat/    (ada) daftar aset yang belum dibuat + gambar acuan
  prototype/       (ada) prototipe yang sudah jadi: karakter/index.html
  tools/           (ada) skrip pemroses aset & pembuat simulasi
  docs/            (ada) dokumen rancangan (file ini)
  client/          Phaser + UI HTML
  server/          Colyseus + Fastify
  shared/          tipe data bersama klien & server
  maps/            peta Tiled (.tmj)
  materi/          file materi HTML + materi.json
  latihan/         soal latihan terminal (SQL, Python, pseudocode) + dataset
```

### Karakter kustom

Karakter dirakit dari tiga bagian (berdasarkan hasil prototipe, bagian 6):

1. **Kepala utuh**: wajah + rambut / hijab / topi dalam satu sprite, 4 arah.
2. **Badan tanpa kepala**: satu set busana lengkap (atasan + bawahan + sepatu).
   Dagu langsung menempel di kerah, tanpa leher.
3. **Aksesori**: kacamata dan headset (relatif terhadap dagu), tas (relatif
   terhadap kerah).

Yang disimpan di database hanya pilihan pemain, misalnya:

```json
{ "gender": "P", "head": "hijab_simple", "hijabColor": "#A9B89A",
  "set": "hoodie", "topColor": "#E8DCC4", "skin": 1,
  "glasses": "acc_glasses_round", "headgear": null, "bag": "acc_backpack" }
```

Gambar disusun di browser masing-masing. Rambut, hijab, topi, dan atasan
berwarna abu-abu lalu diwarnai oleh game, sehingga satu aset menghasilkan
banyak pilihan warna. Warna kulit juga diganti oleh game (5 pilihan).

### Data yang disimpan (garis besar)

| Tabel | Isi |
|---|---|
| `users` | id internal, **NIM / NIP** (unik, untuk login), **nama lengkap** (tanpa username), peran (mahasiswa / dosen / asisten), hash kata sandi |
| `characters` | pilihan karakter (JSON di atas) |
| `courses`, `materials` | mata kuliah dan daftar materi (atau cukup `materi.json`) |
| `quizzes`, `questions` | bank soal |
| `quiz_sessions`, `answers` | kuis yang dijalankan dan jawaban mahasiswa |
| `chat_reports` | hanya pesan yang dilaporkan (lihat bagian 4) |
| `exercise_progress` | latihan terminal yang sudah diselesaikan mahasiswa |
| `code_saves` | kode terakhir mahasiswa per latihan / per mode sandbox (teks kecil) |

Isi chat biasa **tidak** disimpan.

### Identitas pemain

**Diputuskan:** tidak ada username. Nama pemain adalah **nama lengkap**, dan itu
satu-satunya nama yang dipakai di name tag di atas kepala, daftar pemain, chat,
dan nilai.

Akibat yang perlu ditangani (usulan, belum diputuskan):

- Nama lengkap tidak unik (bisa ada dua orang bernama sama), jadi sistem tetap
  memakai **id internal** yang tidak ditampilkan.
- Login memakai **NIM (mahasiswa) atau NIP (dosen) + kata sandi** (diputuskan);
  nama lengkap tidak dipakai sebagai kunci login.
- Perintah `/w` memilih penerima dari daftar atau lewat klik pada karakter,
  bukan dengan mengetik nama (nama lengkap berspasi dan bisa kembar).
- Nama yang panjang dipotong di name tag; nama lengkap ditampilkan utuh di
  daftar pemain dan saat karakter diklik.
- Setiap pemain di ruangan yang sama bisa melihat nama lengkap pemain lain.
  Perlu dipastikan hal ini sesuai dengan kebijakan prodi dan prinsip
  minimisasi data.

### Login dengan NIM

**Diputuskan:** mahasiswa masuk dengan **NIM + kata sandi**, dosen dengan
**NIP + kata sandi**. (Asumsi: asisten adalah mahasiswa, jadi memakai NIM.)

Hal yang masih perlu diputuskan:

- **Pengenal untuk tamu / peran lain** yang tidak punya NIM maupun NIP, bila ada.
- **NIM bukan rahasia** (tertera di daftar kelas dan kartu mahasiswa), jadi
  siapa pun yang tahu NIM teman bisa mendaftar atas namanya. Usulan: dosen atau
  prodi mengunggah **daftar NIM + nama lengkap** per kelas; pendaftaran hanya
  diterima bila NIM ada di daftar, dan nama lengkap diambil dari daftar itu
  (sekaligus menjamin nama asli dan seragam).
- **Kata sandi** dibuat sendiri saat registrasi dan disimpan sebagai hash
  (argon2 / bcrypt); HTTPS wajib. Usulan: lupa kata sandi direset oleh dosen
  atau admin.
- Karakter dibuat saat registrasi (kreator karakter, bagian 6) dan boleh diubah
  kemudian.

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
  (ganti mode), `/w` lalu pilih penerima dari daftar atau klik karakternya
  (Berdua; nama lengkap bisa kembar, jadi tidak diketik), `/g` (Kelompok).
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

## 6. Status prototipe karakter

**Selesai.** Prototipe untuk memastikan karakter bisa dirakit dan berjalan dengan
baik di browser sudah jadi: `prototype/karakter/index.html`. Satu berkas, bisa
dibuka dengan klik dua kali, tanpa server.

### Yang sudah berjalan

| Area | Hasil |
|---|---|
| Gerak | Berjalan 4 arah (panah / WASD / tombol layar untuk HP), animasi 3 frame per arah. Bawaan **lari**; tahan Shift untuk jalan pelan |
| Kamera | Mengikuti karakter dengan halus dan berhenti di tepi dunia. Zoom 1×–4× (bawaan 1×, kelipatan bulat agar piksel tajam), grid petak 32×32 bisa dinyalakan. Dunia uji seluas lobi (40 × 28 petak) dengan perabot sementara |
| Perakitan | Kepala utuh + badan tanpa kepala, tanpa leher; aksesori mengikuti posisi dagu/kerah |
| Jenis kelamin | Laki-laki / Perempuan. Daftar kepala, daftar baju, dan palet warna menyesuaikan. Badan perempuan dirampingkan lewat kode (membuang 4 jalur piksel kain polos); tinggi dan posisi kerah tetap sama sehingga semua kepala dan aksesori cocok |
| Pilihan | 16 sprite kepala, 8 set baju (Hoodie, Flanel, Kaos, Kemeja, Batik, Almamater, Jas lab, dan Tunik khusus perempuan), aksesori (kacamata bulat/kotak, headset, VR, ransel, tas laptop), warna rambut/hijab/topi, warna atasan, 5 warna kulit |
| Aturan | Kepala berhijab hanya bisa memakai Hoodie dan Flanel (sementara). Hijab panjang dan Hijab sport disembunyikan sementara (sprite tetap ada). Peci tidak punya pilihan warna |
| Alat setel | Posisi kepala per jenis kelamin / gaya / arah (±piksel) dan ukuran kepala 100%–80% (diambil ulang dari gambar asli, jadi tetap tajam). Disimpan di `tools/head_adjust.json`. Setelan laki-laki dan perempuan **sudah dikunci**. Hijab tampak belakang sudah tanpa leher |

Daftar kepala saat ini: **laki-laki 10** (pendek rapi, pendek acak, cepak,
keriting, undercut, sebahu, bergelombang, peci, topi, beanie) dan **perempuan 9**
(hijab, panjang, sebahu, kuncir, cepol, bergelombang, pendek rapi, beanie, topi).

### Alur produksi aset

```
assets/characters/raw/*.jpg   hasil Gemini
  -> tools/process_character.py   hapus latar magenta, kembalikan ke piksel asli,
                                  pisahkan kepala / badan / aksesori, buat atlas
  -> tools/build_sim.py           membuat halaman simulasi (atlas tertanam)
```

Menambah set busana baru: masukkan gambar ke `raw/`, daftarkan nomor figurnya
di `SETS` pada `process_character.py`, lalu jalankan kedua skrip (pemrosesan
sekitar 1 menit). Set baru otomatis mendapat versi badan ramping.

### Keterbatasan yang diketahui

- **Tampak samping**: gambar Gemini tidak punya pose berdiri samping murni.
  Hoodie hanya punya 2 frame samping yang konsisten.
- **Pose duduk** di kelas (badan tampak belakang dipotong di pinggang) belum diuji.
- **Aksesori**: tas tidak berayun mengikuti langkah; headphone di leher belum ada.
- **Urutan gambar** (karakter berada di balik benda) belum diatur; perabot
  masih sementara.
- **Ujung rambut panjang** dan hijab panjang terpotong datar (bawaan gambar).
- **Setelan posisi kepala sudah dikunci** untuk laki-laki dan perempuan (tersimpan
  di `head_adjust.json`, alat setel nonaktif). Untuk membuka kunci, hapus huruf
  jenis kelamin dari daftar `locked`. Ukuran kepala belum ada yang diubah (semua 100%).
- **Belum ada penyimpanan pilihan karakter**: pilihan hilang saat halaman dimuat
  ulang.

---

## 7. Tahapan pengerjaan

1. **Prototipe satu pemain** *(sebagian)*: gerak, kamera, dan kreator karakter
   sudah jadi (bagian 6). Masih tersisa peta dari Tiled dengan tileset asli dan
   rak buku yang membuka materi. Belum memakai server.
2. **Terminal perpustakaan**: editor, mode SQL, Python, dan pseudocode,
   sandbox, beberapa latihan contoh. Masih satu pemain, tanpa server.
3. **Multipemain lobi**: saling melihat, pindah ruangan, empat mode chat, emote.
4. **Kuis di kelas**: kursi, panel kuis, halaman dosen untuk memulai kuis
   dan mengunduh nilai; kuis praktik memakai terminal di Lab Komputer.
5. **Login & penyimpanan**: akun, karakter tersimpan, kemajuan latihan, lencana.
6. **Peluncuran**: HTTPS di server, uji coba dengan satu kelas.

---

## 8. Keputusan terbuka

| No | Hal | Pilihan | Status |
|---|---|---|---|
| 1 | Penyimpanan laporan chat | Simpan pesan yang dilaporkan + beberapa pesan sebelumnya, hapus otomatis setelah 7 hari **atau** tanpa penyimpanan sama sekali | belum diputuskan |
| 2 | Karakter kustom | Aset buatan AI (Gemini) dirakit lewat kode **atau** LPC Character Generator (wajib kredit) | berjalan dengan aset AI; terbukti di prototipe (bagian 6) |
| 3 | Server | Server kampus **atau** sewa VPS | belum diputuskan |
| 4 | Login | **NIM (mahasiswa) / NIP (dosen) + kata sandi**, tanpa username, nama pemain = nama lengkap (diputuskan). Masih terbuka: verifikasi pendaftaran dan reset kata sandi (lihat Login dengan NIM) | pengenal diputuskan; detail belum |
| 5 | Nilai kuis | Hanya di game **atau** bisa diunduh dosen (CSV/Excel) | belum diputuskan |
| 6 | Perangkat utama | Laptop, HP, atau keduanya | belum diputuskan |
| 7 | Perawat kode | Dosen, mahasiswa, atau tim IT kampus (memengaruhi bahasa server) | belum diputuskan |
| 8 | Nama platform & nama ruangan | Ide: Kampus Piksel, Gedung Algoritma, InfoVerse, Ruang Kode | belum diputuskan |
