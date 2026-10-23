-- Database contoh "akademik" untuk terminal SQL perpustakaan.
-- Data fiktif. Dipakai sandbox dan latihan dengan `dataset: akademik`.

CREATE TABLE mahasiswa (
  nim       VARCHAR(10) PRIMARY KEY,
  nama      VARCHAR(100) NOT NULL,
  angkatan  INT NOT NULL,
  kota_asal VARCHAR(50)
);

CREATE TABLE matakuliah (
  kode     VARCHAR(10) PRIMARY KEY,
  nama     VARCHAR(100) NOT NULL,
  sks      INT NOT NULL CHECK (sks BETWEEN 1 AND 6),
  semester INT NOT NULL
);

CREATE TABLE nilai (
  nim         VARCHAR(10) NOT NULL,
  kode        VARCHAR(10) NOT NULL,
  nilai_angka DECIMAL(5,2) NOT NULL,
  nilai_huruf CHAR(2) NOT NULL,
  PRIMARY KEY (nim, kode),
  FOREIGN KEY (nim) REFERENCES mahasiswa(nim),
  FOREIGN KEY (kode) REFERENCES matakuliah(kode)
);

INSERT INTO mahasiswa VALUES
  ('2201001', 'Ani Lestari', 2022, 'Pontianak'),
  ('2201002', 'Budi Santoso', 2022, 'Singkawang'),
  ('2201003', 'Citra Dewi', 2022, 'Pontianak'),
  ('2301004', 'Rina Marlina', 2023, 'Ketapang'),
  ('2301005', 'Dimas Pratama', 2023, 'Sintang'),
  ('2301006', 'Lukman Hakim', 2023, 'Pontianak'),
  ('2401007', 'Gita Ramadhani', 2024, 'Mempawah'),
  ('2401008', 'Hendra Wijaya', 2024, 'Singkawang');

INSERT INTO matakuliah VALUES
  ('INF101', 'Logika Komputasional', 3, 1),
  ('INF102', 'Algoritma dan Pemrograman', 4, 1),
  ('INF201', 'Perancangan Basis Data', 3, 3),
  ('INF301', 'Kecerdasan Buatan', 3, 5);

INSERT INTO nilai VALUES
  ('2201001', 'INF101', 88, 'A'),  ('2201001', 'INF102', 79, 'B+'), ('2201001', 'INF201', 91, 'A'),
  ('2201001', 'INF301', 84, 'A-'), ('2201002', 'INF101', 72, 'B'),  ('2201002', 'INF102', 65, 'C+'),
  ('2201002', 'INF201', 70, 'B'),  ('2201003', 'INF101', 95, 'A'),  ('2201003', 'INF102', 90, 'A'),
  ('2201003', 'INF201', 86, 'A'),  ('2201003', 'INF301', 78, 'B+'), ('2301004', 'INF101', 58, 'C'),
  ('2301004', 'INF102', 62, 'C+'), ('2301005', 'INF101', 81, 'A-'), ('2301005', 'INF102', 77, 'B+'),
  ('2301006', 'INF101', 69, 'B-'), ('2301006', 'INF102', 74, 'B'),  ('2401007', 'INF101', 92, 'A'),
  ('2401008', 'INF101', 55, 'C');
