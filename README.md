# LABGLBB

Platform laboratorium fisika berbasis web untuk tracking gerak, analisis kinematika, riwayat eksperimen, dan aktivitas belajar. Dibangun dengan Next.js, TypeScript, Neon PostgreSQL, Drizzle ORM, dan Vercel.

## Fitur
- Beranda publik dengan navigasi tetap.
- Registrasi, login, logout, dan sesi bertanda tangan. Kata sandi di-hash dengan bcrypt.
- Pelacakan benda melalui webcam browser dengan kalibrasi skala dan deteksi warna dasar.
- Analisis posisi, kecepatan, percepatan, regresi kuadratik, dan ekspor CSV.
- Simpan, buka, dan hapus eksperimen milik pengguna.
- Aktivitas belajar Prediksi → Pengamatan → Penjelasan.
- Halaman awal Lab 3D sebagai ruang pengembangan berikutnya.

## Persyaratan
- Node.js 20.9 atau lebih baru.
- Akun Neon PostgreSQL.
- GitHub dan akun Vercel untuk deployment.

## Jalankan secara lokal
1. Ekstrak ZIP dan buka folder `LABGLBB`.
2. Jalankan `npm install`.
3. Salin `.env.example` menjadi `.env.local`.
4. Isi `DATABASE_URL` dari dashboard Neon. Gunakan connection string pooled untuk aplikasi Vercel jika sesuai kebutuhan.
5. Buat `SESSION_SECRET` acak minimal 32 karakter. Contoh pembuatannya: `openssl rand -base64 32`.
6. Jalankan `npm run db:push` untuk membuat tabel di database yang dipilih. Pastikan database benar sebelum menjalankan perintah ini.
7. Jalankan `npm run dev`, lalu buka `http://localhost:3000`.

## Deploy ke GitHub dan Vercel
1. Buat repositori GitHub baru. Ekstrak ZIP, lalu unggah seluruh isi folder proyek (bukan folder ZIP).
2. Di Vercel, pilih **Add New → Project** dan impor repositori GitHub.
3. Tambahkan `DATABASE_URL`, `SESSION_SECRET`, dan `NEXT_PUBLIC_APP_URL` pada Project Settings → Environment Variables. Gunakan URL deployment untuk `NEXT_PUBLIC_APP_URL`.
4. Deploy. Jika tabel belum ada, jalankan `npm run db:push` secara lokal dengan `DATABASE_URL` yang benar, atau gunakan migration terkontrol untuk produksi.
5. Uji registrasi, login, menyimpan eksperimen, membuka riwayat, dan logout setelah deployment.

## Catatan penting
- Jangan pernah mengunggah `.env.local` atau kredensial database ke GitHub.
- Pelacakan kamera menggunakan API browser dan membutuhkan izin kamera. Akses kamera di deployment memerlukan HTTPS.
- Deteksi warna adalah implementasi dasar berbasis piksel. Pantulan cahaya, bayangan, gerakan cepat, dan warna latar dapat memengaruhi hasil. Kalibrasi dan pengujian dengan video nyata diperlukan sebelum penggunaan penelitian.
- Data tracking disimpan sebagai titik koordinat, bukan video. Koordinat layar dikonversi ke satuan fisik melalui kalibrasi skala.
- Kecepatan dan percepatan berasal dari diferensiasi numerik dan rentan terhadap noise. Hasil analisis perlu dibandingkan dengan pengukuran atau data uji yang diketahui.
- Lab 3D saat ini berupa halaman placeholder yang disiapkan untuk pengembangan simulasi berikutnya.
- Sebelum penggunaan publik, pertimbangkan rate limiting, verifikasi email, reset kata sandi, audit keamanan, dan pengujian otomatis.
