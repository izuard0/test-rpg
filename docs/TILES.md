# Tileset: hasil pengolahan dan temuan skala

Gambar tile dari Gemini diolah menjadi sprite transparan. Dokumen ini menjelaskan
hasilnya, cara memakainya, dan **temuan skala yang perlu diputuskan sebelum membuat peta**.

## Menjalankan

```bash
python tools/process_tiles.py                 # semua lembar (± 12 detik)
python tools/process_tiles.py library_floor_wall lobby_doors   # lembar tertentu
python tools/scale_check.py docs/skala-aset.png                # gambar perbandingan skala
```

Masukan: `assets/tiles/<folder>/<lembar>.png` (sebenarnya JPEG; folder `_draft` diabaikan).
Keluaran per lembar di `export/tiles/<lembar>/`:

| Berkas | Isi |
|---|---|
| `atlas.png` | semua sprite yang sudah transparan, tersusun rapat |
| `atlas.json` | daftar sprite: `id`, posisi di atlas (`x,y,w,h`), ukuran dalam petak (`tile` di konfigurasi, kini 28), `nama` (lihat `tools/tile_names.json`) |
| `sheet.png` | seluruh lembar pada resolusi piksel-seni, latar dihapus |
| `preview.png` | `sheet.png` diperbesar 3× dengan kotak dan nomor `id` tiap sprite |

`export/tiles/index.json` meringkas semua lembar. **Skala tidak dinormalisasi:**
1 piksel-seni = 1 piksel.

## Cara kerja

1. **Cari kisi piksel-seni.** Gemini menggambar pada kisi dengan jumlah sel bulat lalu
   membesarkannya ke 1024 px, jadi ukuran sel = 1024 / N. Skrip mencari N yang paling cocok
   dengan tepi warna (hasil: 160–230 sel per sisi; lihat tabel).
2. **Satu warna median per sel** menghasilkan gambar piksel-seni yang tajam dan bebas noda JPEG.
3. **Latar** = warna tepi dominan yang tersambung ke batas gambar (isi banjir) dan sisa magenta.
4. **Tiap bagian terpisah** di luar latar menjadi satu sprite (minimum 30 piksel-seni persegi).
5. **Lembar mosaik** tanpa celah (`lobby_floor_wall`) dipotong menurut garis pemisah 1 piksel
   yang sudah menyatu di gambar; kuncinya `mosaik` dan `sel` di `atlas.json`.

## Hasil per lembar

| Lembar | Sel/sisi | Sprite | Catatan |
|---|---|---|---|
| `library_bookshelves` | 230 | 12 | 4 warna × (biasa, menyala) + rak pendek/samping |
| `library_floor_wall` | 200 | 29 | beberapa petak yang bersentuhan menyatu (mis. nomor 12, 17) |
| `library_furniture` | 200 | 11 | |
| `library_terminals` | 200 | 20 | |
| `library_category_signs` | 200 | 4 | |
| `library_effects` | 200 | 8 | **bermasalah**, lihat "Keterbatasan" |
| `lobby_floor_wall` | 160 | 62 | mode mosaik, sel 8 × 8 sekitar 19–20 px |
| `lobby_doors` | 200 | 20 | |
| `lobby_furniture` | 208 | 26 | beberapa sofa menyatu |
| `lobby_tech` | 208 | 11 | |
| `lobby_decor` | 208 | 23 | sebagian **bermasalah**, lihat "Keterbatasan" |
| `classroom_floor_wall` | 200 | 39 | |
| `classroom_front` | 200 | 14 | |
| `auditorium_seats` | 200 | 16 | berisi juga meja lab dan layar |
| `smart_class_pods` | 200 | 14 | |
| `lab_computer_desks` | 200 | 16 | |
| `room_signs` | 200 | 14 | |
| **Total** | | **339** | 17 lembar |

Semua lembar sudah dilihat langsung pada `preview.png`: tepinya tajam dan latarnya transparan.

## Temuan skala (perlu keputusan)

Gambar [`docs/skala-aset.png`](skala-aset.png) menaruh karakter di samping benda tileset pada
ukuran asli. Hasilnya:

| Benda | Ukuran (piksel-seni) | Terhadap karakter (± 54 px) |
|---|---|---|
| Karakter | ± 29 × 54 | 1,0× |
| Pintu lobi (termasuk papan di atasnya) | 18 × 40 | **0,7×: lebih pendek dari karakter** |
| Rak buku | 44 × 68 | 1,3×, wajar |
| Kursi | 16 × 33 | 0,6×, wajar |
| Meja baca | 110 × 74 | wajar |
| Meja lab | 90 × 42 | wajar |
| Petak lantai perpustakaan | 26 × 28 | bukan 32 |
| Petak lantai kelas | ± 27 × 28 | bukan 32 |
| Sel lantai lobi | 19–20 × 17–20 | **jauh lebih kecil dari 32** |
| Papan kategori perpustakaan | 83 × 61 | **lebih besar dari pintu**; rencananya 64 × 32 |
| Papan nomor ruangan (`room_signs`) | 19–36 × 34–40 | digambar miring seperti monitor, bukan plat datar 32 × 16 |

Dua hal yang harus diselesaikan:

1. **Petak sebenarnya bukan 32 × 32.** Lantai perpustakaan dan kelas sekitar 26–28 px,
   lantai lobi sekitar 20 px, dan ukurannya tidak seragam (lebar 24, 27, 29; tinggi 23, 24, 28).
2. **Beberapa benda menyimpang jauh dari karakter:** pintu terlalu kecil, papan kategori
   perpustakaan terlalu besar, dan sel lantai lobi satu skala lebih kecil dari lantai lain.

Pilihan penanganan (**diputuskan: B + C**, keputusan no. 9 di `RANCANGAN.md`):

| Pilihan | Isi | Catatan |
|---|---|---|
| A | Petak game 32, semua lembar dibesarkan (± 1,2× lantai; 1,6× lobi) | Besar non-bulat membuat piksel tidak rata; **tidak disarankan** |
| B | **Petak game 28**; lantai perpustakaan dan kelas dipakai apa adanya, karakter setinggi ± 2 petak | Hanya lobi dan pintu yang perlu ditangani |
| C | Buat ulang hanya `lobby_floor_wall` dan `lobby_doors` dengan acuan karakter dan ukuran petak | Pelengkap B; papan kategori dan papan ruangan juga perlu dibuat ulang atau diganti elemen HTML |

**Keputusan: B + C (petak 28).** Sebagian besar benda sudah sejalan dengan karakter; hanya
beberapa lembar yang menyimpang. `tile` di konfigurasi sudah menjadi 28. Selama
`lobby_floor_wall` belum dibuat ulang, **lantai lobi memakai petak lantai kelas** (`classroom_floor_wall`).
Petak lantai yang lebarnya 26–27 px dinormalisasi ke 28 × 28 (selisih ≤ 8%, lewat pembesaran
*nearest*) saat tileset peta dibuat; periksa hasilnya secara visual.

## Keterbatasan

- **Efek semi-transparan tidak bisa dipakai.** Bercak sinar matahari, berkas cahaya, debu, dan
  kilau (`library_effects` nomor 5–8; `lobby_decor` nomor 11, 12) digambar di atas latar
  magenta, sehingga menjadi balok merah muda yang **buram**. Buat efek ini lewat kode
  (lapisan alfa), atau abaikan.
- **Kilau tipis dan bintik kecil** di bawah 30 piksel-seni persegi dibuang (mis. percikan pada
  rak buku versi menyala); garis oranye penanda tetap ada.
- **Sprite yang bersentuhan menyatu** menjadi satu (beberapa petak lantai, sofa); pisahkan
  manual bila perlu.
- **`nama` masih kosong.** Penamaan dilakukan dengan melihat `preview.png` dan mengisi `nama`
  pada `atlas.json`.
- **Lembar mosaik** memotong benda yang lebih besar dari satu sel menjadi beberapa sel;
  gabungkan lewat posisi `sel`.
- Draf lama di `assets/tiles/_draft/` (termasuk tileset luar berpilar klasik dengan grid
  menyatu) **tidak diproses**.
- Kisi dipilih otomatis; tepinya terlihat tajam pada semua lembar, tetapi nilai N belum
  diverifikasi terhadap sumber lain.
