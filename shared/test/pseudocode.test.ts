import { describe, expect, it } from "vitest";
import { runPseudocode } from "../src/index.js";

const run = (src: string, input = "") => runPseudocode(src, { input, traceLimit: 500 });

// Contoh-contoh di bawah disalin dari slide Logika Komputasional Minggu 10.
describe("pseudocode: contoh slide Minggu 10", () => {
  it("for: menjumlahkan 1..N", () => {
    const r = run(`ALGORITMA:
   read(N)
   jumlah ← 0
   for i ← 1 to N do
      jumlah ← jumlah + i
   endfor
   write(jumlah)`, "5");
    expect(r.error).toBeUndefined();
    expect(r.output).toEqual(["15"]);
  });

  it("for downto dan teks", () => {
    const r = run(`for i ← 3 downto 1 do
   write(i)
endfor
write('Meluncur!')`);
    expect(r.output).toEqual(["3", "2", "1", "Meluncur!"]);
  });

  it("while dengan sentinel, if-else, konstanta dari DEKLARASI", () => {
    const r = run(`DEKLARASI
   const BATAS_DISKON = 100000
ALGORITMA:
   total ← 0                  { akumulator }
   banyak ← 0                 { pencacah }
   read(harga)
   while harga ≠ 0 do         { 0 = sentinel }
      total ← total + harga
      banyak ← banyak + 1
      read(harga)
   endwhile
   if total > BATAS_DISKON then
      diskon ← 0.1 * total
   else
      diskon ← 0
   endif
   write(banyak, total, diskon, total - diskon)`, "50000 70000 0");
    expect(r.output).toEqual(["2 120000 12000 108000"]);
  });

  it("repeat-until dan flag PIN", () => {
    const r = run(`DEKLARASI
   const PIN_BENAR = 1234
   const MAKS_COBA = 3
ALGORITMA:
   coba ← 0
   benar ← false
   repeat
      read(pin)
      coba ← coba + 1
      if pin = PIN_BENAR then
         benar ← true
      else
         write('PIN salah, sisa: ', MAKS_COBA - coba)
      endif
   until benar or (coba = MAKS_COBA)
   if benar then
      write('Silakan pilih transaksi')
   else
      write('Kartu diblokir')
   endif`, "1111 1234");
    expect(r.output).toEqual(["PIN salah, sisa: 2", "Silakan pilih transaksi"]);
  });

  it("larik: rata-rata dan banyak di atas rata-rata", () => {
    const r = run(`DEKLARASI
   const NMAKS = 100
   nilai : array[1..NMAKS] of real
   i, N : integer
ALGORITMA:
   read(N)
   for i ← 1 to N do
      read(nilai[i])
   endfor
   jumlah ← 0
   for i ← 1 to N do
      jumlah ← jumlah + nilai[i]
   endfor
   rata ← jumlah / N
   banyak ← 0
   for i ← 1 to N do
      if nilai[i] > rata then
         banyak ← banyak + 1
      endif
   endfor
   write(rata, banyak)`, "4 70 80 90 65");
    expect(r.output).toEqual(["76.25 2"]);
  });

  it("pencarian beruntun dengan evaluasi pendek and", () => {
    const r = run(`read(N)
for i ← 1 to N do
   read(nim[i])
endfor
read(dicari)
ketemu ← false
i ← 1
while (i ≤ N) and (not ketemu) do
   if nim[i] = dicari then
      ketemu ← true
   else
      i ← i + 1
   endif
endwhile
if ketemu then
   write('ditemukan pada posisi ', i)
else
   write('tidak ditemukan')
endif`, "3 101 205 309 777");
    expect(r.output).toEqual(["tidak ditemukan"]);
  });

  it("menerima padanan ASCII: <- <= >= <>", () => {
    const r = run(`x <- 5
if (x >= 5) and (x <= 9) and (x <> 6) then
   write('ok')
endif`);
    expect(r.output).toEqual(["ok"]);
  });
});

describe("pseudocode: pesan galat dan pengaman", () => {
  it("menunjuk baris dan memberi saran untuk '=' sebagai pengisian", () => {
    const r = run(`jumlah = 0`);
    expect(r.error?.line).toBe(1);
    expect(r.error?.message).toMatch(/←/);
  });

  it("endfor yang hilang", () => {
    const r = run(`for i ← 1 to 3 do
   write(i)`);
    expect(r.error?.message).toMatch(/endfor/);
  });

  it("indeks di luar batas larik", () => {
    const r = run(`DEKLARASI
   a : array[1..3] of integer
ALGORITMA:
   a[4] ← 1`);
    expect(r.error).toMatchObject({ line: 4 });
    expect(r.error?.message).toMatch(/di luar batas 1..3/);
  });

  it("tipe integer menolak nilai real", () => {
    const r = run(`DEKLARASI
   n : integer
ALGORITMA:
   n ← 7 / 2`);
    expect(r.error?.message).toMatch(/integer/);
  });

  it("perulangan tak berhingga dihentikan", () => {
    const r = runPseudocode(`while true do
   x ← 1
endwhile`, { maxSteps: 1000 });
    expect(r.ok).toBe(false);
    expect(r.error?.message).toMatch(/langkah/);
  });

  it("masukan habis", () => {
    expect(run(`read(a, b)`, "1").error?.message).toMatch(/Masukan habis/);
  });
});

describe("pseudocode: jejak", () => {
  it("mencatat baris dan nilai variabel tiap langkah", () => {
    const r = run(`jumlah ← 0
for i ← 1 to 2 do
   jumlah ← jumlah + i
endfor`);
    expect(r.trace.map((t) => t.line)).toEqual([1, 2, 3, 2, 3]);
    expect(r.trace.at(-1)?.vars).toEqual({ jumlah: "3", i: "2" });
    expect(r.varOrder).toEqual(["jumlah", "i"]);
  });
});
