# Bahan ajar (materi perpustakaan)

Keenam meja baca di Perpustakaan Al-Khawarizmi membuka **katalog yang sama** berisi semua
materi di folder ini. Slide HTML **tidak perlu diubah**; cukup disalin ke sini.

```
bahan_ajar/
  Kecerdasan Buatan/
    supervised_learning_slides_formal.html
  Logika Komputasional/
    Slide_Minggu10_Pseudocode-Lanjut_formal.html
  Perancangan Basis Data/
    P09_SQL_DDL_slides.html
```

- **Nama folder = nama mata kuliah** di katalog.
- **Judul materi** diambil dari `<title>` berkas HTML (akhiran "· Kuliah" dibuang).
- **Urutan** mengikuti nomor minggu di nama berkas (`Minggu10`, `P09`, `pertemuan-3`); berkas
  tanpa nomor ditaruh di akhir, urut abjad.
- Katalog dibuat otomatis saat build (`client/scripts/sync-assets.mjs`), jadi setelah menambah
  berkas cukup push ke `main`; Coolify membangun ulang.
- Materi dibuka di jendela dalam game dan bisa dibuka di tab baru.
