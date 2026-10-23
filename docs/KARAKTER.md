# Karakter: format data dan cara merakit

Spesifikasi untuk klien (Phaser) agar karakter tampil **sama persis** dengan
prototipe `prototype/karakter/index.html`. Prototipe adalah acuan visual: bandingkan
hasil klien dengan prototipe untuk kombinasi yang sama.

## Paket siap pakai

```
export/character/
  atlas.png        satu gambar berisi semua sprite (RGBA, 512 px lebar)
  atlas.json       posisi sprite di atlas + titik sambung (lihat bagian 2)
  config.json      daftar pilihan, palet warna, aturan, konstanta gerak
  head_adjust.json penyetelan posisi kepala per jenis kelamin
```

Dihasilkan oleh `python tools/export_character.py` (jalankan setelah
`process_character.py`). Skrip itu **memeriksa** bahwa semua pilihan di konfigurasi
ada di atlas dan berhenti bila ada yang hilang. Sumber konfigurasi yang boleh
diedit: `tools/character_config.json` dan `tools/head_adjust.json`; isi `export/`
jangan diedit tangan.

## 1. Data pilihan pemain (yang disimpan)

```json
{ "gender": "P", "head": "hijab_simple", "hijabColor": "#A9B89A",
  "set": "hoodie", "topColor": "#E8DCC4", "skin": 1,
  "glasses": null, "headgear": null, "bag": "acc_backpack" }
```

| Kolom | Arti |
|---|---|
| `gender` | `L` atau `P`; menentukan daftar pilihan dan tipe badan |
| `head` | kunci di `config.genders[gender].heads` |
| `hairColor` / `hijabColor` / `capColor` | warna kepala; hanya yang sesuai kategori kepala dipakai (peci tidak punya warna) |
| `set` | kunci di `config.genders[gender].sets` |
| `topColor` | warna atasan (`#RRGGBB`), `null` = warna asli |
| `skin` | indeks 0–4 di `config.skinTones` |
| `glasses`, `headgear`, `bag` | kunci aksesori di `config.accessories`, atau `null` |

Aturan yang harus dijaga (klien **dan** server):

- `head` dan `set` harus ada di daftar jenis kelamin yang dipilih.
- Jika `config.headCategory[head] == "hijab"`, maka `set` harus termasuk
  `config.hijabSets`. Bila tidak, pakai baju pertama yang diizinkan.
- Warna harus dari palet jenis kelamin / kategori (server menolak warna lain).
- Saat jenis kelamin diganti, pasang setelan bawaan `genders[g].def`.

## 2. Isi `atlas.json`

| Kunci | Isi |
|---|---|
| `frames` | `key -> {x, y, w, h}` posisi sprite di `atlas.png` |
| `sets[nama][arah][0..2]` | badan: `{key, neckX, attachY, tintBelow}` |
| `heads[nama][arah]` | kepala: `{key, neckX, neckY}` |
| `acc[nama][arah]` | kacamata / headset / VR: `{key, ax, ay}` atau `null` |
| `bags[nama][arah]` | tas: `{key, ax, ay, w}` atau `null` |
| `overlap` | tumpang-tindih dagu dan kerah (piksel) |

- Arah: `down`, `left`, `right`, `up`. Sprite `right` sudah dicerminkan dari `left`
  saat pemrosesan; **tidak perlu membalik di klien**.
- Badan tiap arah punya **3 frame** (urutan langkah, berdiri, langkah).
- `sets["<nama>_b"]` adalah badan ramping (dipakai `btype: "b"`, yaitu perempuan).
- Semua angka dalam piksel sprite (bukan piksel layar).

## 3. Merakit satu frame

Masukan: titik kaki `(cx, footY)`, arah `dir`, frame `f` (0–2), pilihan pemain.

1. `setKey = btype == "b" ? set + "_b" : set`; `bm = sets[setKey][dir][f]`.
2. Badan: `bx = round(cx - lebarBadan / 2)`, `by = footY - tinggiBadan`.
3. Tas (digambar sebelum kepala), bila ada `bg = bags[bag][dir]`:
   `(round(bx + bm.neckX + bg.ax), by + bm.attachY + bg.ay)`.
4. Kepala `hm = heads[head][dir]`, setelan `adj = head_adjust[gender][head][dir]`
   (`dx`, `dy`, default 0):
   `hx = round(bx + bm.neckX - hm.neckX) + adj.dx`
   `hy = by + bm.attachY + overlap - hm.neckY + adj.dy`
5. Aksesori kepala, relatif ke dagu: `chinX = hx + hm.neckX`, `chinY = hy + hm.neckY`;
   untuk `glasses` lalu `headgear`, bila ada `a = acc[nama][dir]`:
   `(round(chinX + a.ax), chinY + a.ay)`.

Urutan gambar dari bawah: bayangan (elips 20 × 6 px, hitam transparan 28%, di
`footY - 1`), badan, tas, kepala, kacamata, headgear. Karakter **tanpa leher**:
dagu menempel langsung di kerah.

## 4. Pewarnaan

Bagian yang bisa diwarnai digambar abu-abu muda. Untuk tiap piksel tak-transparan,
dengan `L = 0.299 r + 0.587 g + 0.114 b` dan `sat = max(r,g,b) - min(r,g,b)`;
semua ambang ada di `config.recolor`:

- **Kulit** bila `r > g + 18` dan `g > b + 5` dan `r > 150`:
  `k = L / lum(skinReference)`; warna = `skinTones[skin] × k` (dibatasi 255).
- **Tint** bila ada warna dan `sat < 30` dan `L > 95` dan baris `y < tintBelow`:
  `k = L / 185`; warna = `tint × k` (+30 bila `k > 1.12`, untuk sorotan).
  Badan memakai `topColor` dan `tintBelow` dari atlas (batas atasan dan celana);
  kepala memakai warna kategorinya dan `tintBelow = 999`.
- Piksel lain tidak diubah (garis tepi, celana, sepatu, ikon).

Hasil pewarnaan harus **di-cache per kombinasi** (sprite, warna, kulit). Untuk 100
pemain, bangun tekstur tiap tampilan unik **sekali** saat pemain masuk, bukan tiap frame.

## 5. Gerak dan animasi (`config.movement`)

- Urutan frame jalan `walkSequence = [0,1,2,1]`, `animFps = 8`:
  `frame = seq[floor(t × fps) % seq.length]`; diam = frame 1.
- Lari (bawaan) `runSpeed = 150` px/detik, animasi ×`runAnimMultiplier` (1,7).
  Jalan pelan (tahan Shift) `walkSpeed = 80`.
- Arah ditentukan sumbu yang dominan; gerak diagonal dinormalisasi.

## 6. `head_adjust.json`

```json
{ "locked": ["L", "P"],
  "L": { "hair_short_01": { "up": {"dy": -4}, "down": {"dy": -1} } },
  "P": { ... } }
```

- `dy` negatif = naik, `dx` negatif = ke kiri (piksel sprite). Aksesori kepala
  ikut bergeser karena dihitung dari dagu.
- `locked` = jenis kelamin yang sudah final; **jangan ubah setelannya** tanpa diminta.
- Ekspor ramping **tidak mendukung kunci `scale`** (ukuran kepala 80–95%); belum ada
  gaya yang memakainya. Eksporter menolak bila ada.

## 7. Saran porting ke Phaser

- Muat `atlas.png` sebagai tekstur, lalu buat frame manual dari `atlas.json`
  (formatnya bukan format Phaser). Aktifkan `pixelArt: true`, matikan penghalusan,
  zoom kamera kelipatan bulat.
- Pusat bawah karakter = titik kaki (origin 0,5 / 1).
- Bangun satu lembar sprite per tampilan (4 arah × 3 frame) di kanvas luar layar,
  lalu daftarkan sebagai tekstur Phaser. Tentukan ukuran sel dari kombinasi
  terbesar (rambut tinggi + topi + badan) dan **uji semua kombinasi** seperti pada
  prototipe.
- Nama pemain (nama lengkap) ditampilkan di atas kepala; tinggi karakter sekitar
  1,7 petak, jadi sisakan ruang.

## 8. Menambah pilihan baru

1. Simpan gambar mentah di `assets/characters/raw/` (kepala: lembar 5 baris × 6 kolom
   seperti `kepala_*.jpg`; baju: `set_<nama>.jpg`).
2. Daftarkan di `tools/process_character.py` (`SHEETS` untuk kepala, `SETS` untuk baju;
   nomor figur baju dilihat dengan `tools/inspect_set.py`), lalu jalankan skrip itu.
3. Tambahkan kunci ke `tools/character_config.json` (`heads` / `sets` per jenis
   kelamin, `headLabels`, `headCategory`).
4. Jalankan `python tools/build_sim.py` dan `python tools/export_character.py`;
   periksa hasilnya di prototipe, lalu setel posisi kepala bila perlu.
