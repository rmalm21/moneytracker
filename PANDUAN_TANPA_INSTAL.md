# Coba Dompet Ajaib tanpa instal di laptop

Semua proses dilakukan lewat browser. Google Cloud Shell adalah komputer sementara milik Google yang sudah memiliki Node.js, npm, dan Firebase CLI. Jangan menjalankan ZIP dengan klik dua kali.

## Siapkan Firebase

1. Buka https://console.firebase.google.com/ dan pilih project `money-manage-32467`.
2. Buka Project settings (roda gigi) → Your apps. Pilih Web app. Jika belum ada, klik ikon `</>` dan buat aplikasi Web.
3. Pilih tampilan konfigurasi `Config`. Siapkan nilai `firebaseConfig`: `apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, `appId`.
4. Authentication → Sign-in method: aktifkan Email/Password. Tab Users: buat pengguna pertama, misalnya `rama@gmail.com`.
5. Pastikan Firestore Database sudah dibuat. Skrip ini tidak mengubah Rules milik project; jika aplikasi menampilkan galat izin, minta bantuan untuk memeriksa Rules yang sudah ada sebelum mengubahnya.

## Unggah dan jalankan dari browser

1. Unduh `DompetAjaib_v20260925_14.zip` dari percakapan ke laptop kantor. Cukup unduh, tidak perlu ekstrak.
2. Masih di Firebase Console, klik ikon terminal `>_` di pojok atas untuk membuka Cloud Shell. Klik Authorize jika diminta. Tunggu sampai terminal siap.
3. Di toolbar Cloud Shell, klik menu tiga titik → Upload → pilih ZIP tadi. File masuk ke home Cloud Shell.
4. Di terminal Cloud Shell, salin dan jalankan:

   ```bash
   cd ~
   unzip -o DompetAjaib_v20260925_14.zip
   cd dompet-ajaib
   bash COBA_TANPA_INSTAL.sh
   ```

5. Saat diminta nilai Firebase, tempel satu per satu dari langkah awal lalu Enter. Tempel nilainya saja, tanpa nama field atau tanda petik.
6. Tunggu proses build selesai. Ketik `COBA` hanya jika ingin membuat link pratinjau sementara di site `dompetajaib`. Skrip tidak mengubah alamat live utama.
7. Cloud Shell akan menampilkan Preview URL. Klik alamat itu di browser. Untuk akun `rama@gmail.com`, masukkan username `rama` dan password yang dibuat di Firebase.

## Jika terkendala

- `Permission denied` pada Cloud Shell: pastikan akun Google punya akses ke project dan Cloud Shell tidak diblokir kebijakan kantor.
- `unauthorized-domain` saat login: Firebase Console → Authentication → Settings → Authorized domains → tambahkan host dari Preview URL (bagian setelah `https://`, sebelum `/`).
- `Missing or insufficient permissions` setelah login: situs berhasil diunggah, tetapi aturan akses Firestore belum mengizinkan akunmu. Ikuti langkah di bawah; tidak perlu mengunggah ZIP lagi.
- Tidak perlu memasang Node.js atau Firebase CLI di laptop kantor.

## Memperbarui link percobaan setelah ada fitur baru

Gunakan ini jika kamu sudah pernah membuat link percobaan dan sudah menyimpan konfigurasi Firebase di Cloud Shell. Prosesnya tetap dilakukan lewat browser:

1. Unduh ZIP **baru** `DompetAjaib_v20260925_14.zip` dari percakapan. Jangan pakai ZIP lama yang namanya mirip.
2. Buka Cloud Shell yang dipakai sebelumnya. ZIP ini tidak berisi `.env.local`, jadi konfigurasi Firebase lama di Cloud Shell tetap tersimpan. Di toolbar, pilih menu tiga titik → **Upload**, lalu pilih ZIP terbaru.
3. Tempel perintah ini di terminal Cloud Shell:

   ```bash
   cd ~
   unzip -o DompetAjaib_v20260925_14.zip
   bash ~/dompet-ajaib/PERBARUI_LINK_COBA.sh
   ```

4. Tunggu sampai muncul **Preview URL**. Buka alamat itu dan refresh halaman jika masih menampilkan versi lama. Data akun dan aturan Firestore tidak dihapus oleh proses ini; yang diperbarui hanya situs di kanal percobaan.

Jika skrip mengatakan konfigurasi `.env.local` tidak ada, jalankan `bash COBA_TANPA_INSTAL.sh` dari folder yang sama dan masukkan konfigurasi Firebase lagi. Instalasi yang dibutuhkan berjalan di Cloud Shell, bukan laptop kantor.

Kalau muncul `No such file or directory`, periksa nama ZIP di Cloud Shell dengan `ls -1 ~/*.zip`. Unggah ZIP baru jika belum terlihat, lalu jalankan lagi tiga perintah pada langkah 3. Jalankan skrip dengan alamat lengkap `bash ~/dompet-ajaib/PERBARUI_LINK_COBA.sh` agar folder terminal tidak membuatnya sulit ditemukan.

## Aturan keamanan Firestore

Skrip pembaruan link hanya mengunggah tampilan aplikasi. Agar larangan membayar dari dompet yang dinonaktifkan juga diperiksa oleh database, lakukan langkah ini **satu kali** di browser:

1. Buka [Firebase Console](https://console.firebase.google.com/) → project `money-manage-32467` → **Firestore Database** → tab **Rules**.
2. Baca aturan yang terpasang. Bila masih aturan lama yang hanya memeriksa UID pemilik, atau aturan bawaan `allow read, write: if false;`, ganti dengan aturan lengkap di bawah.
3. Klik **Publish**, lalu refresh link percobaan. Aturan ini menjaga catatan lama; transaksi pengeluaran baru dari dompet yang tidak boleh membayar ditolak.
4. Jika aturannya sudah punya bagian lain yang khusus untuk aplikasi lain, **jangan timpa semuanya**. Simpan tangkapan layar tab Rules (tanpa password) untuk dibantu menggabungkan aturan secara aman.

```text
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function own(userId) { return request.auth != null && request.auth.uid == userId; }
    function canPay(userId, walletId) {
      let wallet = get(/databases/$(database)/documents/users/$(userId)/wallets/$(walletId));
      return wallet.data.get('isArchived', false) == false
        && wallet.data.get('isSpendable', true) == true
        && wallet.data.get('canPay', true) == true;
    }
    function expenseAllowed(userId, previous) {
      return request.resource.data.get('type', '') != 'expense'
        || (previous != null && previous.data.get('type', '') == 'expense'
            && previous.data.get('walletId', '') == request.resource.data.get('walletId', ''))
        || canPay(userId, request.resource.data.get('walletId', ''));
    }
    match /users/{userId} {
      allow read, write: if own(userId);
      match /transactions/{transactionId} {
        allow read, delete: if own(userId);
        allow create: if own(userId) && expenseAllowed(userId, null);
        allow update: if own(userId) && expenseAllowed(userId, resource);
      }
      match /{collectionName}/{documentId} {
        allow read, write: if own(userId) && collectionName != 'transactions';
      }
    }
  }
}
```

Jika kamu hanya memperbarui link dan belum mengubah Rules, aplikasi tetap menyaring pilihan dompet di formulir dan saat menyimpan melalui aplikasi. Aturan di atas menambah perlindungan apabila ada penulisan langsung ke database.

## Cek cepat setelah pembaruan

1. Masuk dengan akun yang sama; saldo, transaksi, dan kategori lama harus tetap ada.
2. Di **Dompet**, ubah ikon/warna satu dompet. Coba nonaktifkan **Bisa membayar**, lalu buka transaksi baru: dompet itu tidak boleh muncul sebagai asal pengeluaran. Riwayat lama tetap ada.
3. Di **Kategori**, pilih ikon dan warna serta geser urutan. Di **Dashboard → Atur Dashboard**, tampilkan/sembunyikan kartu dan ubah urutannya.
4. Di **Piutang**, buka rincian dan tambah catatan. Di **Analisis**, ketuk kategori pada grafik untuk melihat bagiannya. Di **Pengaturan → Tampilan**, ganti tema; warna berubah langsung.
5. Buka lewat browser HP jika ada. Cek lebar layar kecil: kartu uang, pencarian, formulir pembayaran, dan tombol di bawah tetap mudah disentuh. Jika saldo cache berbeda, jalankan **Pengaturan → Periksa Data** untuk meninjau perbaikan.


## Perubahan tidak terlihat?

- `PERBARUI_LINK_COBA.sh` pertama-tama memperbarui **link percobaan** (Preview URL, alamatnya berisi `--coba-dompet-ajaib`). Alamat utama `dompetajaib.web.app` baru ikut berubah jika kamu mengetik `LIVE` saat diminta di akhir skrip.
- Pastikan ZIP yang diunggah adalah ZIP terbaru, lalu jalankan `unzip -o` dengan nama file yang sama persis.
- Setelah deploy, tutup tab aplikasi lalu buka lagi. Buka **Pengaturan** dan lihat tulisan **Versi aplikasi** di bagian bawah; versi terbaru adalah `2026.09.24-4`.
- Kategori lama tidak diubah otomatis. Untuk menambahkan subkategori ke kategori yang sudah ada, buka **Kategori → Ambil dari Template**, centang kategorinya, lalu pilih **Lengkapi subkategori**.
