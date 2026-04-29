# Catatan Perubahan Aplikasi Rapot

## Ringkasan
Dokumen ini merangkum seluruh perubahan yang sudah dikerjakan pada aplikasi, mencakup hak akses, input nilai, sinkronisasi data rapor/leger, narasi deskripsi, dan perbaikan export PDF.

## 1) Role, Akses, dan Navigasi
- Dashboard dibatasi hanya untuk role `admin`.
- Role `wali kelas` dan `guru` tidak lagi bisa mengakses halaman dashboard.
- Menu sidebar dan route dipisahkan sesuai role agar tidak muncul halaman yang tidak berhak diakses.
- Normalisasi pembacaan role agar tahan terhadap variasi format data role.

## 2) Manajemen Guru
- Memperbaiki alur `Tambah Guru` agar benar-benar membuka mode tambah (bukan kebawa mode edit guru lain).
- Form guru diperbaiki agar state reset saat ganti mode tambah/edit.
- Penambahan dan edit data `mapel yang diajar` diperkuat agar sinkron ke akun guru.
- Dukungan wali kelas untuk memilih kelas yang dipimpin.
- Sinkronisasi data wali kelas ke data kelas (`waliKelasId` / `waliKelasName`).

## 3) Input Nilai
- Dropdown mapel pada akun guru diperbaiki agar muncul sesuai mapel yang diajarkan akun tersebut.
- Filter kelas/mapel pada input nilai disesuaikan dengan hak akses guru/wali kelas.
- Perbaikan konsistensi data nilai agar perubahan langsung terbaca di halaman lain.

## 4) Daftar Nilai, Kelola Rapor, dan Leger (Sinkronisasi)
- Kelola Rapor dan Leger disinkronkan otomatis terhadap perubahan pada Daftar Nilai.
- Data progres input tidak lagi statis, tetapi dihitung ulang dari data nilai aktual.
- Perbaikan kasus mismatch jumlah siswa (contoh label 15 tapi data 16).
- Perbaikan kasus Leger kosong padahal nilai sudah terisi.
- Refactor sinkronisasi 4 halaman utama:
  - `Input Nilai`
  - `Daftar Nilai`
  - `Leger Nilai`
  - `Kelola Rapor`
- `Input Nilai` dijadikan sumber data utama, lalu tiga halaman lain membaca perubahan dari koleksi `grades` yang sama.
- Sinkronisasi realtime diterapkan agar perubahan nilai pada satu halaman langsung memengaruhi halaman lain tanpa logika hitung yang berbeda-beda.
- Normalisasi struktur data nilai lama/baru dipusatkan ke util bersama agar pembacaan field seperti `student_id/studentId`, `mapelId/subject_id`, `na/final_score`, dan komponen nilai tetap konsisten.

## 5) Logika Progres Input (Robust)
- Progres input dihitung per siswa berdasarkan kelengkapan mapel.
- Jika ada mapel siswa belum diisi, progres turun sesuai porsi ketidaklengkapan.
- Jika semua mapel siswa terisi, progres bisa 100%.
- Logika dibuat adaptif untuk penambahan/pengurangan mapel di masa depan (tidak hardcoded jumlah mapel).

## 6) Narasi Deskripsi Nilai
- Format narasi disesuaikan ke gaya yang mudah dipahami wali murid.
- Struktur narasi menggunakan dua bagian makna:
  - Narasi A: capaian yang sudah baik.
  - Narasi B: bagian yang masih perlu latihan/bimbingan.
- Narasi menggunakan nama siswa masing-masing (bukan istilah umum seperti "peserta didik").
- Aturan tampil narasi mengikuti nilai mapel terhadap KKM:
  - Nilai di atas/menyentuh KKM menonjolkan narasi A lalu diikuti narasi B.
  - Nilai di bawah KKM memunculkan narasi B (tetap dengan bahasa yang suportif).
- Penanganan nilai kosong/0 diberi kalimat pendampingan khusus.

## 7) Perbaikan PDF Rapor (Preview Rapor Siswa)
- Mengurangi masalah blank page pada halaman genap saat download/cetak PDF rapor.
- Menata ulang page-break CSS agar konten tidak terdorong ke halaman kosong.
- Perbaikan deskripsi rapor agar mengikuti narasi terbaru.

## 8) Perbaikan PDF Leger
- Area sumber export PDF ditetapkan dari elemen `.paper-sheet`.
- Perbaikan clipping kanan/bawah: seluruh konten paper-sheet ikut ter-capture.
- Export dibuat adaptif terhadap perubahan jumlah mapel/kolom (bertambah/berkurang).
- Wrap text narasi diaktifkan agar konten panjang tidak merusak layout.
- Perbaikan keterbacaan kolom `Rata2` dan `Rank`:
  - kolom dibuat tetap terbaca (`nowrap`, center, lebar minimum stabil, font lebih tegas).
- Penyesuaian layout tabel saat export (`table-layout: auto`) supaya kolom penting tidak gepeng.

## 9) Login dan Akun Dev
- Menambahkan akun dev hardcoded untuk pengujian cepat.
- Auto-provision akun dev ke Auth + sinkron ke Firestore saat login.
- Toggle lihat/sembunyikan password pada halaman login.
- Perapihan UI login (label tombol dan teks bantuan).

## 10) File Utama yang Disentuh
- `frontend/src/router/index.js`
- `frontend/src/layouts/DashboardLayout.vue`
- `frontend/src/views/Login.vue`
- `frontend/src/views/MasterGuru.vue`
- `frontend/src/views/InputNilai.vue`
- `frontend/src/views/DaftarNilai.vue`
- `frontend/src/views/WaliKelasRapor.vue`
- `frontend/src/views/LegerNilai.vue`
- `frontend/src/utils/gradeSync.js`

## 11) Verifikasi
- Build frontend sudah dijalankan dan sukses dengan `npm run build`.
- Warning ukuran bundle masih ada, namun tidak menghalangi proses build maupun fungsi utama aplikasi.

## 12) Refactor Pengaturan Rapor ke CMS di Kelola Rapor
- Halaman/menu terpisah `Pengaturan Rapor` dihapus dari route dan sidebar.
- Pengaturan dipindahkan ke halaman `Kelola Rapor` dalam bentuk panel `CMS Lengkap Preview Rapor`.
- CMS kini mencakup pengaturan konten global yang tampil pada preview/cetak/PDF:
  - Data sekolah dan penandatangan.
  - Periode rapor (tahun ajaran, semester, tanggal rapor).
  - Judul dan subjudul rapor.
  - Judul tiap seksi (ekstrakurikuler, prestasi, ketidakhadiran, catatan).
  - Teks statis preview (judul sampul, label tertentu, header tabel, blok tanda tangan).
  - Daftar dinamis ekstrakurikuler, prestasi, dan ketidakhadiran (tambah/hapus baris).
- Data CMS disimpan ke Firestore:
  - `settings/rapor_content_cms`
  - `settings/rapor_config`
  - `settings/school_info`

## 13) Upload Logo dari CMS
- CMS `Kelola Rapor` ditambah input upload file gambar untuk logo sekolah (JPG/PNG/SVG).
- Saat simpan CMS:
  - File logo diupload ke Firebase Storage (`settings/logo-sekolah.<ext>`).
  - URL download otomatis disimpan ke `raporConfig.logoUrl` dan `school_info.logoUrl`.
- Ditambah preview logo, validasi tipe file gambar, dan aksi batal upload.

## 14) Perbaikan Error CORS Upload Storage
- Ditemukan error upload logo dari `localhost:5173` karena konfigurasi bucket Storage tidak tepat.
- `storageBucket` diubah dari `si-rapor.firebasestorage.app` menjadi `si-rapor.appspot.com`.
- Setelah perubahan konfigurasi, build frontend tetap sukses.

## 15) File Utama Tambahan yang Disentuh
- `frontend/src/views/WaliKelasRapor.vue`
- `frontend/src/firebase.js`
- `frontend/src/router/index.js`
- `frontend/src/layouts/DashboardLayout.vue`
- `frontend/src/views/PengaturanRapor.vue` (dihapus)
