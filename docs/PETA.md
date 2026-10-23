# Peta: keputusan, tata letak, dan format

Spesifikasi peta untuk tahap 1. Keputusan di bagian 1 sudah disetujui pemilik proyek
(23 Oktober 2026). Satuan koordinat adalah **petak** (28 px); `(x, y)` dihitung dari
pojok kiri atas, dan benda ditulis dengan petak kiri-atas **telapaknya** (bagian yang
menapak lantai). Gambar benda boleh lebih tinggi dari telapaknya.

## 1. Keputusan

| # | Topik | Keputusan |
|---|---|---|
| 1 | Tampilan | **Kamera mengikuti pemain**, agak tele (zoom bulat 2× atau lebih) *(diubah dari "kamera diam", disetujui pemilik proyek)* |
| 2 | Rak buku | **6 rak**: 2 biru (Logika Komputasional), 2 oranye (Kecerdasan Buatan), 2 hijau (cadangan, "segera hadir") |
| 3 | Terminal | **4 terminal**, semuanya membuka terminal praktik yang sama; latihan dipilih di dalam panel |
| 4 | Tabrakan pemain | **Pemain saling menembus** (tanpa tabrakan antarpemain) |
| 5 | Perpindahan | **Hibrida (diubah, disetujui):** satu peta **`kampus`** yang terhubung untuk halaman luar, lobi, dan perpustakaan (satu ruangan Colyseus, server hanya mengirim pemain di sekitar); **kelas tetap terpisah** lewat pintu (satu ruangan Colyseus per kelas) agar kuis, kursi terkunci, dan chat terisolasi |
| 6 | Kursi kelas | Bebas memilih kursi kosong; **terkunci saat kuis dimulai**; yang terlambat masuk sebagai **penonton** (tidak ikut dinilai kecuali diizinkan dosen) |
| 7 | Pembuatan peta | Berkas **Tiled (`.tmj`)** dihasilkan skrip dari spesifikasi ini, lalu bisa disunting di Tiled |
| 8 | Nama ruangan | Perpustakaan Al-Khawarizmi, Lab Lovelace, Ruang Kolaborasi, Auditorium Turing |

## 2. Ruangan

| Kode | Nama | Ukuran (petak) | Piksel | Kapasitas | Isi |
|---|---|---|---|---|---|
| `lobi` | Lobi | 40 × 28 | 1.120 × 784 | 100 | zona nongkrong, 5 pintu |
| `perpustakaan` | Perpustakaan Al-Khawarizmi | 30 × 22 | 840 × 616 | 40 *(usulan)* | 6 rak, 4 terminal, pustakawan |
| `kelas-a` | Lab Lovelace | 20 × 18 | 560 × 504 | 30 + 2 | 30 kursi (5 baris × 6) |
| `kelas-b` | Ruang Kolaborasi | 24 × 20 | 672 × 560 | 45 + 2 | 9 meja kelompok × 5 kursi |
| `kelas-c` | Auditorium Turing | 28 × 20 | 784 × 560 | 60 + 2 | 60 kursi (6 baris × 10) |

Kapasitas kelas = jumlah kursi + 2 tempat berdiri untuk dosen dan asisten. Ukuran kelas
berbeda dari angka lama di dokumen aset (20 × 16, 24 × 18) karena baris meja dan kursi
ternyata butuh ruang lebih. Kapasitas perpustakaan 40 adalah usulan agar ruangan tidak
terlalu padat; ubah bila perlu.

## 3. Aturan umum

**Kamera (aturan lama, hanya untuk ruangan kelas yang kecil).** Zoom `z` = bilangan bulat terbesar dengan `lebarRuangan × z ≤ lebar layar` dan
`tinggiRuangan × z ≤ tinggi layar`, minimal 1; ruangan di tengah, latar navy `#1B2A41`.
Bila layar lebih kecil dari ruangan pada zoom 1, kamera mengikuti pemain (cadangan).

> **Peringatan.** Pada layar 1920 × 1080 semua ruangan memakai zoom 1, sehingga lobi hanya
> menutupi ± 58% lebar layar. Pilihan: (a) terima dan isi margin dengan latar/hiasan
> (saran untuk versi pertama), (b) perbesar lobi ke ± 64 × 36 petak agar memenuhi layar
> 1080p (butuh lebih banyak seni), (c) zoom tidak bulat (merusak ketajaman piksel;
> tidak disarankan).

**Tabrakan.** Pemain berpijak pada kotak kaki 12 × 8 px di bawah karakter. Rintangan
berupa persegi panjang di lapisan `collision`, bukan per petak, karena benda ditempatkan
bebas piksel. **Tidak ada tabrakan antarpemain.**

**Kedalaman.** Benda dan karakter diurutkan menurut `y` tepi bawah (urutan Y). Lapisan
`above` selalu di atas karakter (lampu, bingkai pintu bagian atas).

**Interaksi.** Pemain berdiri dalam 1 petak dari `titik interaksi` benda lalu menekan `E`
(atau mengetuk di HP). Penanda berupa panah oranye kecil di atas benda yang bisa dipakai.

**Perpindahan.** Pintu berpindah ruangan dengan pudar 0,3 detik; server memindahkan pemain
ke ruangan Colyseus tujuan dan memunculkannya di titik muncul bernama.

**Aturan chat per ruangan** mengikuti `docs/RANCANGAN.md` bagian 4. Peta hanya menyimpan
properti zona (`chatRadius`, `chatPublic`).

## 4. Perpustakaan Al-Khawarizmi (30 × 22)

Legenda: `#` dinding, `.` lantai parket, `c` karpet navy, `w` jendela, `S` telapak rak
(`s` = bagian rak yang menjulang), `T` terminal, `t` meja baca (4 × 3 termasuk kursi),
`P` meja pustakawan, `n` pustakawan, `o` sofa, `L` troli buku, `W` papan tulis beroda,
`B` bilik belajar, `p` tanaman, `D` pintu ke lobi, `@` titik muncul.

```
     0         1         2         
     012345678901234567890123456789
  0  ###w#####w#####w#####w####w###
  1  ###w#####w#####w#####w####w###
  2  #p..........................p#
  3  #..ss..ss..ss..ss..ss..ss....#
  4  #..SS..SS..SS..SS..SS..SS....#
  5  #..........................T.#
  6  #............................#
  7  #............................#
  8  #...cccccccccccccccccccccc.T.#
  9  #...ccttttcccttttccccccccc...#
 10  D.@.ccttttcccttttcccccccWW...#
 11  D.@.ccttttcccttttccccccccc.T.#
 12  #...cccccccccccccccccccccc...#
 13  #...cccccccccccccccccccccc...#
 14  #...ccttttcccttttccccccccc.T.#
 15  #..nccttttcccttttccccccccc...#
 16  #.PPPcttttcccttttccccccccc...#
 17  #.PPPccccccccccccccccBBBcc...#
 18  #...cccccccccccccccccBBBcc...#
 19  #..................LL...o.o..#
 20  #p..........................p#
 21  ##############################
```

| Benda | Sprite (lihat `tools/tile_names.json`) | Telapak (x, y, w × h) | Catatan |
|---|---|---|---|
| Rak 1, 2 | `rak_biru`, `rak_biru_2` | (3,4) dan (7,4), 2 × 1 | Logika Komputasional |
| Rak 3, 4 | `rak_oranye` (dipakai dua kali) | (11,4) dan (15,4), 2 × 1 | Kecerdasan Buatan |
| Rak 5, 6 | `rak_hijau`, `rak_hijau_2` | (19,4) dan (23,4), 2 × 1 | Cadangan, "segera hadir" |
| Terminal 1–4 | `kios_nyala_*` (satu varian yang menghadap kiri) | (27,5) (27,8) (27,11) (27,14), 1 × 1 | Titik interaksi di x = 26 |
| Meja baca ×4 | `meja_baca_panjang` | (6,9) (13,9) (6,14) (13,14), 4 × 3 | Hanya dekorasi |
| Meja pustakawan | `meja_pustakawan` | (2,16), 3 × 2 | NPC pustakawan di (3,15) |
| Sofa ×2 | `sofa_tunggal_biru_1`, `_2` | (24,19) dan (26,19), 1 × 1 | Pojok baca |
| Troli buku | `troli_buku` | (19,19), 2 × 1 | |
| Papan tulis | `papan_tulis_beroda` | (24,10), 2 × 1 | |
| Bilik belajar | `bilik_belajar_tiga` | (21,17), 3 × 2 | Dekorasi |
| Tanaman ×4 | `tanaman_pakis` | (1,2) (28,2) (1,20) (28,20) | |
| Jendela ×5 | `jendela_kayu` | di dinding atas, x = 3, 9, 15, 21, 26 | |
| Karpet | `karpet_navy_*` | area x = 4–25, y = 8–18 | Sisanya `lantai_parket_*` |

**Titik interaksi:** rak di `(x+1, 5)`; terminal di `(26, y)`; pustakawan di `(3, 18)`; pintu
di `(1, 10–11)`. **Titik muncul:** `dari_lobi` di `(2, 10–11)`.

**Properti rak:** `course` (kode mata kuliah di `materi.json`), `color`, `title`. Rak cadangan
memakai `course = ""` dan menampilkan "segera hadir".

**Tidak dipakai:** papan kategori (83 × 61 px) terlalu besar dan diganti label HTML di atas
rak. `rak_abu_menyala` tidak dipakai karena hanya ada versi menyala.

**Zona:** seluruh ruangan, `chatRadius = 3`, `chatPublic = false`.

## 5. Lobi (40 × 28)

Legenda: `V` layar video (dinding atas), `A`/`B`/`C` pintu Lab Lovelace, Ruang Kolaborasi,
Auditorium Turing, `L` pintu perpustakaan, `E` pintu masuk, `l` area santai (kantong
kacang, sofa), `k` area kopi, `m` meja kerja bersama, `e` pojok pameran, `a` pojok arkade,
`i` meja informasi, `@` area muncul, `p` tanaman. Zona hanya menandai wilayah; letak benda
persisnya dihasilkan skrip pembuat peta.

```
     0         1         2         3         
     0123456789012345678901234567890123456789
  0  ##############VVVVVVVVVVVV##############
  1  ##############VVVVVVVVVVVV##############
  2  #p....................................p#
  3  #.....llllllll..............kkkkkkkk...#
  4  #.....llllllll..............kkkkkkkk...#
  5  #.....llllllll..............kkkkkkkk...#
  6  A.....llllllll.........................#
  7  A.....llllllll.........................#
  8  #.....llllllll.........................#
  9  #.....llllllll.........................#
 10  #......................................#
 11  #......................................#
 12  B.............mmmmmmmmmmmm.............L
 13  B.............mmmmmmmmmmmm.............L
 14  #.............mmmmmmmmmmmm.............#
 15  #......................................#
 16  #......................................#
 17  #............................eeeeeeeee.#
 18  C............................eeeeeeeee.#
 19  C............................eeeeeeeee.#
 20  #............................eeeeeeeee.#
 21  #..aaaaaa........iiiiii......eeeeeeeee.#
 22  #..aaaaaa........iiiiii......eeeeeeeee.#
 23  #..aaaaaa....................eeeeeeeee.#
 24  #..aaaaaa......@@@@@@@@@@....eeeeeeeee.#
 25  #p.aaaaaa......@@@@@@@@@@.............p#
 26  #..............@@@@@@@@@@..............#
 27  ###################EE###################
```

| Elemen | Letak |
|---|---|
| Pintu kelas A, B, C | dinding kiri, di y = 6–7, 12–13, 18–19 |
| Pintu perpustakaan | dinding kanan, di y = 12–13 |
| Pintu masuk | dinding bawah, di x = 19–20 |
| Layar video | dinding atas, x = 14–25 (papan peringkat dan pengumuman) |
| Area muncul | x = 15–24, y = 24–26 (titik acak agar tidak bertumpuk) |
| Lorong bebas | x = 1–4 (depan pintu kiri) dan x = 35–38 (depan pintu kanan) |

Kapasitas 100 orang: luas dalam ± 38 × 26 = 988 petak; pemain saling menembus, jadi
kepadatan bukan masalah tabrakan, hanya keterbacaan.

**Zona:** seluruh lobi, `chatRadius = 5`, `chatPublic = "dibatasi"`.
**Lantai sementara:** petak lantai vinil dari `classroom_floor_wall`, karena
`lobby_floor_wall` berskala berbeda dan akan dibuat ulang (`docs/TILES.md`).

## 6. Kelas

Posisi kursi **dihasilkan skrip dari parameter**, bukan ditulis tangan.

| Parameter | Lab Lovelace (`kelas-a`) | Ruang Kolaborasi (`kelas-b`) | Auditorium Turing (`kelas-c`) |
|---|---|---|---|
| Ukuran | 20 × 18 | 24 × 20 | 28 × 20 |
| Kursi | 30 | 45 | 60 |
| Susunan | 5 baris × 3 meja × 2 kursi | 3 × 3 meja kelompok × 5 kursi | 6 baris × 10 kursi |
| Jarak baris | 2,5 petak | 4 petak (meja 3 × 3 + sela) | 1,5 petak |
| Area depan | y = 2–4 (papan, meja dosen) | y = 2–4 | panggung y = 2–6, layar raksasa |
| Pintu | dinding bawah | dinding bawah | dinding bawah |
| Titik muncul | `dari_lobi` di atas pintu | sama | sama |
| Tampilan monitor | menyala saat kursi terisi | meja kelompok menyala | tidak ada |

- Semua kursi menghadap atas. Pemain yang duduk digambar dari belakang: badan tampak
  belakang dipotong di pinggang (belum diuji; lihat `docs/RANCANGAN.md` bagian 6).
- Kursi kosong menyala oranye saat didekati; satu kursi satu pemain.
- Properti kursi: `seatId`, `row`, `col`; properti zona: `chatRadius`, `chatPublic = true`
  (dimatikan saat kuis berlangsung, kecuali untuk dosen).
- Kunci kursi: saat dosen memulai kuis, kursi kosong ditandai terkunci; yang masuk
  sesudahnya menjadi **penonton**.

## 7. Format Tiled

Berkas di `maps/<kode>.tmj`. Ukuran petak peta 28 × 28. Lapisan (urutan dari bawah):

| Lapisan | Jenis | Isi |
|---|---|---|
| `floor` | tile | lantai (petak 28 × 28 yang sudah dinormalisasi) |
| `walls` | tile | dinding |
| `below` | objek | dekorasi di bawah karakter (karpet, bayangan) |
| `objects` | objek (tile object) | perabot dan benda; **diurutkan menurut y** bersama karakter |
| `above` | objek | selalu di atas karakter |
| `collision` | objek (persegi) | rintangan |
| `interact` | objek | titik interaksi |
| `spawn` | objek (titik) | titik muncul |
| `zones` | objek (persegi) | properti zona |

Properti objek (kunci dalam bahasa Inggris agar mudah dipakai kode):

| Jenis (`type`) | Properti |
|---|---|
| `door` | `target` (kode ruangan), `spawn` (nama titik muncul), `label` |
| `shelf` | `course`, `color`, `title` |
| `terminal` | `mode` (`"terminal"`) |
| `seat` | `seatId`, `row`, `col` |
| `npc` | `npc` (kunci NPC), `dialog` |
| `spawn` | `name` (mis. `dari_lobi`, `dari_perpustakaan`, `masuk`) |
| zona | `name`, `chatRadius`, `chatPublic` |

Set tile: `floor-wall` (petak 28 × 28 hasil normalisasi) dan set **kumpulan gambar** untuk benda
bebas ukuran (rak, kios, meja). Skrip pipeline perlu mengekspor tiap sprite sebagai PNG
terpisah untuk set ini (belum ada; lihat bagian 9).

## 8. Aset: yang siap dan yang belum

| Kebutuhan | Kondisi |
|---|---|
| Sprite perpustakaan (rak, kios, perabot, lantai, dinding) | Siap dan sudah bernama |
| Lantai perpustakaan | Perlu **normalisasi ke 28 × 28** (lebar asli 23–28, tinggi 22–28) |
| Sprite kelas dan lobi | Terpotong, **belum diberi nama** (`nama` kosong) |
| `lobby_floor_wall`, `lobby_doors` | **Dibuat ulang** (skala berbeda); sementara memakai lantai kelas |
| Pustakawan, NPC lain | Belum dibuat; pakai penampung sementara |
| Penanda interaksi (panah oranye) | Belum dibuat (`items/` belum ada); pakai gambar sementara dari kode |
| Papan kategori dan papan nomor ruangan | Diganti label HTML |

## 9. Status dan urutan pengerjaan

**Peta (semuanya dihasilkan skrip; jangan sunting `.tmj` dengan tangan):**

| Peta | Isi | Ukuran | Perintah |
|---|---|---|---|
| `maps/kampus.tmj` | halaman luar, lobi, perpustakaan (satu ruangan Colyseus) | 78 × 54 petak (2.184 × 1.512 px) | `python tools/make_map.py kampus` |
| `maps/kelas-a.tmj` | Lab Lovelace, 30 kursi bertipe `seat` | 20 × 18 | `python tools/make_map.py kelas-a` |

- **Kampus.** Lobi 40 × 28 di kiri atas; perpustakaan **36 × 28** (diperbesar dari 30 × 22 karena
  perabotnya kini 2×) di sebelah kanan, tersambung lewat bukaan di dinding timur lobi (tanpa layar
  loading). Di selatan lobi ada **gedung depan** (aset luar ruangan, 2×) dengan lorong ke lobi,
  plaza berair mancur, jalan batu, pohon, bangku, lampu, dan rak sepeda. Tiga pintu kiri lobi menuju
  kelas A/B/C (ruangan terpisah). Titik muncul pemain baru: `awal` di depan gedung.
- **Skala.** Perabot besar digambar **2×** (`scale` di tata letak); lantai 28 px per petak.
- **Lorong gedung depan.** Gedung menempel di dinding selatan lobi dan pintunya sejajar dengan bukaan
  dinding. Di Phaser, urutkan kedalaman menurut **tepi bawah** sprite supaya pemain tampak
  "masuk" di balik gedung lalu muncul di lobi. Sayap gedung bertabrakan lewat objek `blok`; lorong x=19..21 terbuka.
- Tata letak sumber: `tools/layouts/{kampus,lobi,perpustakaan,kelas-a}.py`. `lobi.py` dan
  `perpustakaan.py` kini hanya **data** yang digeser oleh `kampus.py` (tidak lagi dibangun sendiri).
- Aset luar ruangan: `tools/process_outdoor.py` mengolah `assets/tiles/_draft/outdoor_tileset_*.jpg`
  (kisi hitam 2 px di gambar mentah diperbaiki; 1 piksel seni = 4 px sumber) menjadi
  `export/tiles/outdoor/{sprites,ground}/`.

**Catatan keandalan.** Berkas `.tmj` divalidasi skrip (gid, gambar, id objek ganda) dan pratinjau
digambar ulang dari berkas itu, bukan dari spesifikasi. Namun berkas ini **belum pernah dibuka di
aplikasi Tiled** maupun dimuat di Phaser. Objek memakai kunci `type` (bukan `class`).

**Belum:**

1. Kelas B dan C. Kelas A masih berskala 1× (lihat pertanyaan skala di bawah).
2. Lantai lobi asli dan pintu lobi setinggi karakter (lantai lobi sementara memakai lantai kelas).
3. NPC pustakawan dan NPC lain (belum ada sprite).
4. Uji buka di Tiled dan muat di Phaser; uji beban satu ruangan kampus (± 150 pemain, hanya kirim pemain di sekitar).
5. **Skala perabot vs karakter.** Perabot 2× (mis. kursi 48 × 78 px) lebih besar daripada karakter
   (29 × 54 px). Perlu dilihat bersama karakter di game; kelas (30–60 kursi) di skala 2× butuh ruangan jauh lebih besar.
