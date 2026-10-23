# Materi perpustakaan

Rak buku di Perpustakaan Al-Khawarizmi membuka daftar materi dari `materi.json`.
Slide HTML yang sudah ada **tidak perlu diubah**; cukup disalin ke sini.

```
materi/
  materi.json
  logika-komputasional/
    minggu-01.html
    ...
  kecerdasan-buatan/
    ...
```

Contoh isi `items`:

```json
{ "title": "Minggu 1 · Pengantar Logika", "file": "logika-komputasional/minggu-01.html", "week": 1 }
```

- `code` mata kuliah harus sama dengan properti `course` rak di peta.
- Rak dengan `course` kosong menampilkan "segera hadir".
- Materi dibuka di panel (iframe) dan bisa dibuka di tab baru.
- Folder ini ikut disalin ke klien saat build (`client/scripts/sync-assets.mjs`).
