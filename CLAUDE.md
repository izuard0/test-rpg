# Panduan proyek Virtual Class

Game RPG 2D pixel di browser untuk Prodi Informatika. **Sumber kebenaran:
`docs/RANCANGAN.md`.** Baca dulu sebelum mengubah apa pun; keputusan di sana sudah
disepakati dengan pemilik proyek, jangan diubah diam-diam.

## Keputusan yang sering terlewat

- Tech stack: TypeScript di klien dan server, Phaser 3, Tiled (peta JSON), UI
  HTML/CSS di atas kanvas, Colyseus (Node.js) untuk multipemain, Fastify +
  PostgreSQL (Prisma), CodeMirror 6 + sql.js + Pyodide untuk terminal.
- **Tidak ada username.** Nama pemain = nama lengkap. Login: **NIM (mahasiswa) /
  NIP (dosen) + kata sandi**. Sistem tetap memakai id internal karena nama bisa kembar.
- Isi chat **tidak disimpan**. Penyaringan penerima dilakukan di server.
- Kode latihan mahasiswa dijalankan **di browser** (Web Worker + batas waktu),
  bukan di server.
- Kepala berhijab sementara hanya boleh memakai baju Hoodie dan Flanel; Hijab
  panjang dan Hijab sport disembunyikan dulu.

## Konvensi

- Dokumen, teks antarmuka, dan komentar kode: **bahasa Indonesia**.
- Petak (tile) **32 × 32 piksel**. Zoom kamera hanya kelipatan bulat agar piksel tajam.
- Nama berkas aset: huruf kecil, garis bawah, tanpa spasi (`set_hoodie.jpg`).
- Gambar buatan AI **tidak boleh berisi tulisan**; semua teks dibuat lewat kode.
- Jarak dalam game diukur dalam **petak**, bukan piksel layar.
- Jangan commit rahasia atau `.env`.

## Alur aset karakter

Karakter dirakit di browser dari tiga bagian: **kepala utuh** (wajah + rambut/hijab/
topi), **badan tanpa kepala** (satu set busana), dan **aksesori**. Dagu langsung
menempel di kerah, **tanpa leher**.

```
assets/characters/raw/*.jpg  (hasil Gemini)
  -> python tools/process_character.py   (hapus latar, kembalikan ke piksel asli,
                                          pisahkan bagian, buat atlas)
  -> python tools/build_sim.py           (bangun prototype/karakter/index.html)
  -> python tools/export_character.py    (validasi + paket ramping ke export/character/)
```

Daftar pilihan, palet, dan aturan karakter ada di **`tools/character_config.json`**
(satu-satunya sumber; prototipe membacanya). Spesifikasi perakitan untuk klien:
**`docs/KARAKTER.md`**.

- `prototype/karakter/` (`atlas.png`, `atlas.json`, `index.html`) **dihasilkan
  otomatis**. Jangan edit tangan; ubah skrip lalu jalankan ulang.
- Prototipe (`tools/build_sim.py`, fungsi `drawChar` dan `recolor`) adalah acuan
  visual; klien Phaser harus menghasilkan tampilan yang sama (lihat `docs/KARAKTER.md`).
- Menambah set busana: simpan gambar di `assets/characters/raw/set_<nama>.jpg`,
  jalankan `python tools/inspect_set.py <gambar> <keluaran.png>` untuk melihat nomor
  tiap figur, lalu daftarkan di `SETS` pada `process_character.py` dan jalankan
  kedua skrip.
- `tools/head_adjust.json` menyimpan penyetelan posisi kepala. Kunci `locked`
  berisi jenis kelamin yang sudah final (`L`, `P`). **Jangan ubah setelan yang
  terkunci** tanpa diminta; untuk membuka, hapus hurufnya dari `locked`.
- Rambut, hijab, topi, dan atasan digambar **abu-abu muda** lalu diwarnai oleh kode.
  Badan perempuan dibuat dari badan laki-laki lewat kode (`tools/slim.py`).

## Alur aset tile

```
assets/tiles/<folder>/<lembar>.png  (JPEG; latar polos atau magenta)
  -> python tools/process_tiles.py   (kisi piksel-seni -> latar dihapus -> sprite -> atlas)
  -> export/tiles/<lembar>/{atlas.png, atlas.json, sheet.png, preview.png}
```

**Baca `docs/TILES.md` sebelum membuat peta.** Skala belum dinormalisasi: petak
sebenarnya sekitar 26–28 px (lobi sekitar 20 px), bukan 32; pintu lebih pendek dari
karakter; efek semi-transparan menjadi balok buram. Ukuran petak game adalah
keputusan terbuka no. 9 di `docs/RANCANGAN.md`; jangan menetapkannya diam-diam.
`nama` sprite di `atlas.json` masih kosong; isi dengan melihat `preview.png`.

## Jebakan yang sudah ditemui (hemat waktu)

- Gambar Gemini selalu **JPEG** walau dinamai `.png`; latarnya magenta `#FF00FF`
  atau warna polos, tidak pernah transparan sungguhan. Ada noda ungu di tepi.
- Gemini **tidak patuh pada tata letak grid** yang diminta, tetapi meniru tata
  letak gambar acuan. Karena itu figur dideteksi satu per satu (`tools/inspect_set.py`),
  bukan dipotong dengan grid tetap.
- Frame tampak samping dari Gemini campur arah (kiri/kanan) dan 3/4; periksa arah
  sebelum dipakai, cerminkan seperlunya.
- Memperkecil sprite jadi buram. Ukuran kepala yang lebih kecil diambil **ulang dari
  gambar asli** dengan grid piksel lebih besar (`pixelate(..., pitch)`).
- Kacamata/headset dipisahkan dari kepala botak polos dengan membandingkan gambar;
  jangan menggambar ulang manual.

## Menjalankan dan menguji

```bash
pip install -r requirements.txt
python tools/process_character.py && python tools/build_sim.py
python -m http.server 8765 --bind 127.0.0.1 --directory prototype/karakter
```

Tidak ada tes otomatis. Pemeriksaan dilakukan dengan membuka prototipe di browser
dan membandingkan hasil secara visual.

## Aset yang belum ada

Lihat `belum-dibuat/DAFTAR_ASET_BELUM_DIBUAT.txt` (12 gambar: NPC, ikon, dua latar).
Aset yang belum ada tidak menghalangi tahap 1; pakai penampung sementara.
