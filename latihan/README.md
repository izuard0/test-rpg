# Latihan terminal perpustakaan

Bilik komputer di Perpustakaan Al-Khawarizmi membuka **terminal praktik**. Latihan ditulis
sebagai berkas YAML di folder ini, sehingga dosen bisa menambah soal **tanpa mengubah kode game**.
Setelah menambah atau mengubah berkas, push ke `main`; Coolify membangun ulang.

```
latihan/
  data/akademik.sql        database contoh (mahasiswa, matakuliah, nilai)
  pseudocode/*.yaml        latihan pseudocode
  sql/*.yaml               latihan SQL
```

Urutan di daftar mengikuti nama berkas, jadi beri awalan nomor (`01_`, `02_`, ...).

## Latihan pseudocode

```yaml
judul: Jumlah 1 sampai N
mataKuliah: Logika Komputasional
deskripsi: |
  Baca sebuah bilangan bulat N, lalu tulis hasil 1 + 2 + ... + N.
  Gunakan pengulangan `for`.          # `...` tampil sebagai kode; baris "- " jadi daftar
kodeAwal: |                           # opsional: isi awal editor
  ALGORITMA:
     read(N)
uji:                                  # masukan untuk read() -> keluaran yang diharapkan
  - masukan: "5"
    keluaran: "15"
  - masukan: "3"
    keluaran: |                       # beberapa baris keluaran
      3
      2
      1
kunci: |                              # opsional tapi disarankan; TIDAK dikirim ke browser
  ALGORITMA: ...
```

- Keluaran dibandingkan baris per baris; spasi berlebih diabaikan.
- Bila `kunci` diisi, build **menjalankan kunci terhadap semua uji** dan berhenti bila ada yang
  tidak cocok. Ini menangkap salah ketik di soal sebelum dipakai mahasiswa.
- Nilai `write()` dipisah satu spasi; bilangan real ditampilkan paling banyak 4 angka di
  belakang titik (mis. `76.25`).

## Latihan SQL

```yaml
judul: Mahasiswa angkatan 2023
mataKuliah: Perancangan Basis Data
dataset: akademik                     # latihan/data/<nama>.sql, atau "kosong"
deskripsi: |
  Tampilkan nama mahasiswa angkatan 2023, urut abjad nama.
kodeAwal: |
  SELECT ...
kunci: SELECT nama FROM mahasiswa WHERE angkatan = 2023 ORDER BY nama;
```

- `kunci` dijalankan **saat build**; yang dikirim ke browser hanya hasilnya, bukan query-nya.
- Hasil SELECT terakhir mahasiswa dibandingkan dengan hasil kunci: banyak kolom dan isi baris
  harus sama, nama kolom (alias) diabaikan. **Urutan baris ikut dinilai bila kunci memakai
  `ORDER BY`.**
- Latihan DDL memakai `periksa`: query yang dijalankan sesudah kode mahasiswa, dan hasilnya
  yang dibandingkan. `persiapan` dijalankan sebelum kode mahasiswa (mis. membuat tabel induk).
  Contoh: `sql/04_ddl_instruktur.yaml`, `sql/05_ddl_kursus_fk.yaml`.
- Bila server punya MySQL praktik (`PRAKTIK_MYSQL_URL`), latihan dijalankan dan **dinilai di
  MySQL 8 sungguhan**: kode mahasiswa dan `kunci` masing-masing dijalankan di database baru
  berisi dataset + `persiapan`, lalu hasil SELECT terakhirnya dibandingkan. Latihan DDL butuh
  `periksaMysql`: query pemeriksa versi MySQL (biasanya `information_schema` dengan
  `table_schema = DATABASE()`), yang dijalankan pada hasil kunci dan hasil mahasiswa.
  Tulis `persiapan` dengan sintaks MySQL (diterjemahkan otomatis untuk SQLite).
  Contoh: `sql/04_ddl_instruktur.yaml`.
- Tanpa MySQL praktik, mesin SQL adalah SQLite (sql.js) di browser. Sintaks MySQL yang umum di kuliah diterjemahkan otomatis:
  `INT AUTO_INCREMENT PRIMARY KEY`, `UNSIGNED`, `TRUNCATE TABLE`, `ENGINE=...`, `SHOW TABLES`,
  `DESCRIBE tabel`. `FOREIGN KEY` aktif.
- `ALTER TABLE` gaya MySQL didukung penuh untuk materi P09: `ADD COLUMN ... AFTER/FIRST`,
  `MODIFY COLUMN`, `CHANGE COLUMN`, `RENAME COLUMN`, `DROP COLUMN`, `ADD CONSTRAINT`
  (UNIQUE/CHECK/FOREIGN KEY), `DROP CONSTRAINT`, `ALTER COLUMN ... SET/DROP DEFAULT`.
  Bentuk yang tidak didukung SQLite dijalankan dengan membangun ulang tabel (prosedur resmi
  SQLite); data lama ikut disalin, dan perubahan dibatalkan bila data melanggar constraint baru.

## Keamanan dan batas

SQL berjalan di **MySQL praktik di server** bila tersedia (user sementara per sesi, 5 detik per
query; lihat README utama). Pseudocode, dan SQL tanpa MySQL praktik, berjalan **di browser
masing-masing** (Web Worker), dengan batas waktu 3 detik,
maksimal 200.000 langkah pseudocode, dan 1.000 baris keluaran. Karena pemeriksaan berjalan di
browser, mahasiswa yang gigih tetap bisa mengakalinya; untuk latihan mandiri ini dapat diterima.
Kuis bernilai akan diperiksa di server (tahap 4).
