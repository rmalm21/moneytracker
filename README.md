# Dompet Ajaib

Aplikasi keuangan pribadi multiakun berbasis Next.js, TypeScript, Tailwind CSS, komponen UI berbasis Radix, Recharts, Firebase Authentication, Firestore, Storage, dan PWA. Bahasa tampilan Indonesia, mata uang Rupiah.

## Pembaruan 24 September 2026

- Menu ponsel membuka seluruh fitur melalui tombol **Lainnya**, serta tombol **Tambah** untuk mencatat cepat. Sidebar desktop dapat diringkas.
- Pilihan, tanggal, dan waktu memakai kontrol di dalam aplikasi. Tampilan serta bilah gulir mengikuti tema akun.
- Dashboard, transaksi, analisis, dan laporan mendukung rentang waktu yang sama. Grafik analisis dapat dikelompokkan harian, mingguan, bulanan, atau tahunan tanpa mengubah total transaksi.
- Pengaturan akun menyediakan pilihan zona waktu, dompet awal, tanggal gajian, ambang anggaran, urutan kartu, tema termasuk Soft Peach, mode terang/gelap/sistem, dan warna aksen.
- Pintasan **Catat cepat** dapat diatur nama, nominal, jenis, dompet, kategori, subkategori, ikon, serta urutannya. Siklus setiap anggaran dapat mengikuti gaji, bulan kalender, atau tanggal mulai sendiri.

### Penyempurnaan kontrol keuangan

- **Dompet**: pratinjau saldo ledger/cache dan rekonsiliasi saldo aktual melalui transaksi penyesuaian yang dapat dilacak.
- **Transaksi**: pembagian kategori, biaya transfer yang masuk pengeluaran, pencarian responsif yang tetap mengikuti filter.
- **Siklus gaji**: tutup siklus dan simpan snapshot historis; perbaikan transaksi lama memperbarui laporan, dengan pemulihan manual di Riwayat Siklus.
- **Perencanaan**: inbox transaksi rutin, rencana/komitmen tanpa perubahan saldo aktual, kalender keuangan, arus kas mendatang.
- **Analisis**: Uang Gue Sebenarnya, Mode Realistis per UID, anggaran spent/committed/available, timeline, catatan, aturan kategori, pemeriksaan data.
- Seluruh struktur baru disimpan pada subkoleksi `users/{uid}`; catatan lama tanpa field baru memakai nilai bawaan yang aman. Tidak ada migrasi yang menghapus data.

Untuk pembaruan link percobaan melalui browser tanpa memasang program di laptop, ikuti `PANDUAN_TANPA_INSTAL.md` dalam ZIP terbaru.

## Aktifkan Firebase

1. Di Firebase Console untuk project `money-manage-32467`, aktifkan **Authentication → Sign-in method → Email/Password**. Buat akun pengguna secara manual di **Authentication → Users** (misalnya `rama@gmail.com`). Tidak ada pendaftaran publik.
2. Aktifkan **Cloud Firestore** dan **Cloud Storage**. Pastikan site Firebase Hosting dengan ID `dompetajaib` tersedia.
3. Di **Authentication → Settings → Authorized domains**, pastikan `dompetajaib.web.app` dan domain pengembangan yang dipakai tersedia.
4. Salin `.env.example` menjadi `.env.local`, lalu isi keenam nilai `NEXT_PUBLIC_FIREBASE_*` dari **Project settings → Your apps → Web app**. Domain login pendek dapat diubah lewat `NEXT_PUBLIC_AUTH_EMAIL_DOMAIN`. Nilai Firebase web config boleh ada dalam bundel frontend; perlindungan data bertumpu pada autentikasi dan security rules.
5. Jalankan:

```bash
npm ci
npm run dev
```

Buka `http://localhost:3000`. Login dapat memakai `rama` untuk akun `rama@gmail.com`; email penuh juga bisa. Pada login pertama, buat dompet atau pilih contoh anggaran secara eksplisit.

## Uji dan deploy

```bash
npm test
npm run typecheck
npm run build
npm install -g firebase-tools
firebase login
firebase use money-manage-32467
firebase deploy --only firestore,storage,hosting
```

`next build` menghasilkan direktori `out/` untuk Firebase Hosting. `firebase.json` mengarah ke site `dompetajaib`. **Periksa isi `.env.local` sebelum build**, sebab variabel `NEXT_PUBLIC_*` disisipkan saat build. Deploy aturan Firestore dan Storage bersama situs.

## Alur penting

- Tiap akun tersimpan di `users/{uid}/...`; Security Rules memeriksa UID dari Firebase Authentication. Pindah akun mengosongkan state dan menghentikan listener akun sebelumnya.
- Dropdown formulir tampil sebagai menu aplikasi; sidebar desktop dapat diringkas dan pilihannya diingat oleh browser. Tombol **Catat cepat** dapat ditambah, diubah, diurutkan, dan dihapus; susunannya tersimpan di profil akun.
- Pengeluaran mengurangi dompet dan anggaran; pemasukan menaikkan dompet; transfer antar dompet tidak dihitung sebagai pemasukan atau pengeluaran.
- Klaim dan piutang yang ditangani sebagai talangan mengurangi kas serta menambah tagihan. Ketika dibayar, kas naik dan tagihan turun. Pelunasan utang menurunkan kas dan kewajiban.
- Edit dan hapus transaksi memperbaiki dampak dompet dengan membalik transaksi lama. Transaksi pembuka klaim/piutang/utang diedit dari catatan induk agar nilai tetap konsisten.
- Dompet memiliki saldo awal serta saldo cache. Tombol **Hitung ulang** membangun ulang saldo dari seluruh ledger.
- Siklus gaji bisa 1–31; tanggal yang tidak ada pada bulan tertentu memakai tanggal terakhir bulan tersebut. Anggaran dapat memakai siklus gaji atau bulan kalender. Rollover dihitung saat siklus baru dibuka.
- Backup JSON dapat digabung atau mengganti data sesudah pratinjau dan konfirmasi. Backup dari UID lain memerlukan persetujuan khusus. CSV transaksi mencakup seluruh riwayat.
- Pengingat rutin dapat membuat draft saat aplikasi dibuka setelah tanggal jatuh tempo. Draft tidak mengubah saldo sebelum pengguna mengonfirmasi.
- Penambahan transaksi mandiri dapat masuk antrean offline Firestore. Edit dan pembayaran yang perlu verifikasi saldo/tagihan memerlukan koneksi.

## Batas pengujian saat ini

Build statis dan pengujian hitung lokal sudah dijalankan. Uji login sungguhan, pergantian akun, aturan akses lintas UID, upload lampiran, serta deploy memerlukan konfigurasi dan akses Firebase project. Jangan langsung memakai data keuangan nyata sebelum alur itu diuji di project Firebase.

Grafik riwayat panjang memakai transaksi yang termuat pada layar; halaman Transaksi menyediakan tombol untuk memuat seluruh riwayat saat diperlukan. Proyeksi adalah simulasi berbasis pola dan asumsi pengguna. Riwayat aset bersih historis dan impor berukuran besar yang sepenuhnya atomik belum tersedia.

## Struktur

- `app/` — halaman utama, login, tema dan gaya.
- `components/` — dashboard, formulir, layar keuangan, analisis, pengaturan.
- `lib/accounting.ts` — aturan saldo, siklus, budget dan metrik.
- `lib/firestore.ts` — operasi keuangan atomik, listener, backup.
- `firestore.rules`, `storage.rules` — isolasi akses menurut UID.
- `public/` — manifest, icon, service worker.
- `tests/` — skenario konsistensi finansial.

Dokumentasi rujukan: [Next.js static export](https://nextjs.org/docs/app/guides/static-exports), [Firebase Hosting](https://firebase.google.com/docs/hosting/quickstart), [Firestore offline](https://firebase.google.com/docs/firestore/manage-data/enable-offline).
