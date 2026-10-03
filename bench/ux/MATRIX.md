# Matriks discovery fitur — Dompet Ajaib 5.0

Dibuat otomatis dari `lib/features.ts` (57 kemampuan). Kolom "4.10" = jalur yang ada sebelumnya; "5.0" = semua jalur sekarang.

| Fitur | Kelompok | Tampil default | Pemicu kontekstual | Kata kunci (contoh) | Jalur 4.10 | Jalur 5.0 |
|---|---|---|---|---|---|---|
| Catat transaksi | Catat | Selalu terlihat | – | tambah, input, catat, transaksi baru | Tombol Tambah | Cari · Jelajahi · Tambah · Tanya Jawab |
| Catat pengeluaran | Catat | Selalu terlihat | – | keluar, expense, belanja, bayar | Tombol Tambah | Cari · Jelajahi · Tambah |
| Catat pemasukan | Catat | Selalu terlihat | – | masuk, income, gaji, gajian | Tombol Tambah | Cari · Jelajahi · Tambah |
| Transfer antardompet | Catat | Selalu terlihat | – | transfer, pindah, tf, top up | Tombol Tambah | Cari · Jelajahi · Tambah |
| Catat otomatis | Catat | Selalu terlihat | – | otomatis, chat, tulis, ketik | Tombol Tambah | Cari · Jelajahi · Tambah · Tanya Jawab |
| Scan struk | Catat | Selalu terlihat | – | struk, nota, foto, scan | Tombol Tambah | Cari · Jelajahi · Tambah |
| Perlu dikonfirmasi | Catat | Saat relevan | inbox | konfirmasi, draft, draf, menunggu | Tab di hub | Cari · Jelajahi · Menu/Lainnya |
| Transaksi | Catat | Selalu terlihat | – | riwayat, history, mutasi, daftar transaksi | Menu | Cari · Jelajahi · Menu/Lainnya |
| Dompet | Kelola uang | Selalu terlihat | – | saldo, rekening, bank, e-wallet | Menu | Cari · Jelajahi · Menu/Lainnya |
| Tambah dompet | Kelola uang | Selalu terlihat | – | dompet baru, rekening baru, tambah rekening, add wallet | Di halaman wallets (menu/tombol) | Cari · Jelajahi · Yang bisa dilakukan di sini |
| Uang tersedia & uang bebas | Kelola uang | Selalu terlihat | – | uang bebas, uang tersedia, uang yang bisa dipakai, uang aman | Di halaman dashboard (menu/tombol) | Cari · Jelajahi · Yang bisa dilakukan di sini · Tanya Jawab |
| Kantong | Kelola uang | Saat relevan | manyWallets | kantong, pocket, amplop, pisahkan uang | Di halaman wallets (menu/tombol) | Cari · Jelajahi · Yang bisa dilakukan di sini · Tanya Jawab |
| Bunga otomatis dompet | Kelola uang | Konteks / cari | savingsWallet, aturan discovery | bunga, interest, bunga tabungan, bunga harian | Di halaman wallets (menu/tombol) | Cari · Jelajahi · Yang bisa dilakukan di sini · Saran kontekstual |
| Cocokkan saldo | Kelola uang | Konteks / cari | – | rekonsiliasi, reconcile, cocokkan, samakan saldo | Di halaman wallets (menu/tombol) | Cari · Jelajahi · Yang bisa dilakukan di sini · Tanya Jawab |
| Hitung ulang saldo | Kelola uang | Cari / Jelajahi | – | hitung ulang, recalculate, saldo salah, perbaiki saldo | Di halaman wallets (menu/tombol) | Cari · Jelajahi · Yang bisa dilakukan di sini · Tanya Jawab |
| Arsipkan dompet | Kelola uang | Konteks / cari | – | arsip, hapus dompet, tutup rekening, archive | Di halaman wallets | Cari · Jelajahi · Yang bisa dilakukan di sini |
| Kategori | Kelola uang | Saat relevan | – | kategori, subkategori, category, jenis pengeluaran | Menu | Cari · Jelajahi · Menu/Lainnya |
| Utang & cicilan | Utang, piutang & klaim | Saat relevan | debts | utang, hutang, cicilan, pinjaman | Tab di hub | Cari · Jelajahi · Menu/Lainnya · Tanya Jawab |
| Bayar utang | Utang, piutang & klaim | Saat relevan | debts | bayar cicilan, lunasi utang, bayar utang, angsuran | Tombol Tambah | Cari · Jelajahi · Tambah · Yang bisa dilakukan di sini |
| Piutang | Utang, piutang & klaim | Saat relevan | receivables | piutang, dipinjam, pinjamkan, uang balik | Tab di hub | Cari · Jelajahi · Menu/Lainnya · Tanya Jawab |
| Klaim kantor | Utang, piutang & klaim | Saat relevan | claims, aturan discovery | klaim, claim, reimburse, reimbursement | Tab di hub | Cari · Jelajahi · Menu/Lainnya · Saran kontekstual · Tanya Jawab |
| Split Bill | Utang, piutang & klaim | Saat relevan | receiptTx, aturan discovery | split, split bill, patungan, bagi tagihan | Menu | Cari · Jelajahi · Menu/Lainnya · Saran kontekstual |
| Bagi tagihan baru | Utang, piutang & klaim | Saat relevan | – | split baru, bagi struk, patungan baru | Di halaman splitbill (menu/tombol) | Cari · Jelajahi · Yang bisa dilakukan di sini |
| Laporan utang & piutang | Utang, piutang & klaim | Konteks / cari | debts, receivables | laporan utang, laporan piutang, rekap utang, ringkasan pinjaman | Tab di hub | Cari · Jelajahi · Menu/Lainnya |
| Arsip utang & piutang | Utang, piutang & klaim | Konteks / cari | – | lunas, arsip utang, arsip piutang, riwayat pinjaman | Tab di hub | Cari · Jelajahi · Menu/Lainnya |
| Anggaran | Rencanakan | Selalu terlihat | manyTx, aturan discovery | anggaran, budget, budgeting, batas belanja | Menu | Cari · Jelajahi · Menu/Lainnya · Saran kontekstual · Tanya Jawab |
| Sisa anggaran dibawa ke periode berikutnya | Rencanakan | Konteks / cari | – | rollover, sisa dibawa, carry over, akumulasi anggaran | Di halaman budgets | Cari · Jelajahi · Yang bisa dilakukan di sini · Tanya Jawab |
| Tujuan dana | Rencanakan | Saat relevan | fullCycle | tujuan, target, goal, goals | Menu | Cari · Jelajahi · Menu/Lainnya · Tanya Jawab |
| Wish list | Rencanakan | Saat relevan | – | wishlist, wish list, keinginan, ingin beli | Menu | Cari · Jelajahi · Menu/Lainnya |
| Arus kas mendatang | Rencanakan | Saat relevan | plans, recurring | mendatang, akan datang, jadwal, upcoming | Tab di hub | Cari · Jelajahi · Menu/Lainnya |
| Kalender keuangan | Rencanakan | Saat relevan | plans, notes | kalender, calendar, tanggal, jadwal bulanan | Tab di hub | Cari · Jelajahi · Menu/Lainnya |
| Kalau beli ini? | Rencanakan | Konteks / cari | – | kalau beli, simulasi beli, mampu beli, boleh beli | Di halaman forecast (menu/tombol) | Cari · Jelajahi · Yang bisa dilakukan di sini |
| Insight | Pahami | Selalu terlihat | fullCycle, aturan discovery | insight, saran, analisa, kondisi keuangan | Menu | Cari · Jelajahi · Menu/Lainnya · Saran kontekstual |
| Skenario (simulasi) | Pahami | Konteks / cari | fullCycle | skenario, simulasi, scenario, bagaimana jika | Di halaman advisor (menu/tombol) | Cari · Jelajahi · Yang bisa dilakukan di sini |
| Indeks harga pribadi | Pahami | Konteks / cari | manyReceipts, aturan discovery | harga, harga naik, inflasi, indeks harga | Di halaman advisor (menu/tombol) | Cari · Jelajahi · Yang bisa dilakukan di sini · Saran kontekstual |
| Analisis | Pahami | Saat relevan | manyTx | analisis, analytics, grafik, chart | Tab di hub | Cari · Jelajahi · Menu/Lainnya |
| Laporan | Pahami | Saat relevan | manyTx | laporan, report, rekap, bulanan | Tab di hub | Cari · Jelajahi · Menu/Lainnya |
| Proyeksi | Pahami | Saat relevan | fullCycle | proyeksi, forecast, perkiraan, ramalan saldo | Tab di hub | Cari · Jelajahi · Menu/Lainnya |
| Riwayat siklus | Pahami | Konteks / cari | fullCycle | siklus, riwayat siklus, tutup buku, periode gaji | Tab di hub | Cari · Jelajahi · Menu/Lainnya · Tanya Jawab |
| Rutin | Otomatisasi | Saat relevan | repeatPayment, aturan discovery | rutin, recurring, berulang, tagihan | Tab di hub | Cari · Jelajahi · Menu/Lainnya · Saran kontekstual |
| Pengingat | Otomatisasi | Saat relevan | aturan discovery | pengingat, reminder, notifikasi, alarm | Pengaturan › reminders | Cari · Jelajahi · Yang bisa dilakukan di sini · Saran kontekstual |
| Bahasa Saya | Otomatisasi | Konteks / cari | aturan discovery | kamus, kamus pribadi, bahasa saya, singkatan | Pengaturan › language | Cari · Jelajahi · Yang bisa dilakukan di sini · Saran kontekstual · Tanya Jawab |
| Periksa data | Data & pengaturan | Konteks / cari | healthIssues, aturan discovery | periksa data, data error, data salah, kesehatan data | Menu | Cari · Jelajahi · Saran kontekstual |
| Pengaturan | Data & pengaturan | Selalu terlihat | – | pengaturan, setting, settings, atur | Pengaturan | Cari · Jelajahi · Menu/Lainnya |
| Profil & gaji | Data & pengaturan | Saat relevan | – | profil, gaji, tanggal gajian, siklus gaji | Pengaturan › profile | Cari · Jelajahi · Yang bisa dilakukan di sini |
| Kontrol keuangan | Data & pengaturan | Konteks / cari | – | kontrol, cadangan, buffer, aset bersih | Pengaturan › control | Cari · Jelajahi · Yang bisa dilakukan di sini · Tanya Jawab |
| Keamanan | Data & pengaturan | Saat relevan | – | pin, password, kata sandi, keamanan | Pengaturan › security | Cari · Jelajahi · Yang bisa dilakukan di sini |
| Tampilan | Data & pengaturan | Saat relevan | – | tema, tampilan, mode gelap, dark mode | Pengaturan › appearance | Cari · Jelajahi · Yang bisa dilakukan di sini |
| Atur Beranda | Data & pengaturan | Saat relevan | – | atur beranda, widget, kartu beranda, dashboard | Di halaman dashboard (menu/tombol) | Cari · Jelajahi · Yang bisa dilakukan di sini |
| Sembunyikan nominal | Data & pengaturan | Saat relevan | – | sembunyikan, privasi, hide, samarkan nominal | Di halaman dashboard | Cari · Jelajahi |
| Cadangan data | Data & pengaturan | Konteks / cari | – | backup, cadangan, unduh data, export | Pengaturan › data | Cari · Jelajahi · Yang bisa dilakukan di sini |
| Sinkronkan ulang | Data & pengaturan | Cari / Jelajahi | – | sinkron, sync, muat ulang, data beda perangkat | Pengaturan › data | Cari · Jelajahi · Yang bisa dilakukan di sini |
| Pasang aplikasi | Data & pengaturan | Saat relevan | – | pasang, install, pwa, layar utama | Pengaturan › app | Cari · Jelajahi · Yang bisa dilakukan di sini |
| Info aplikasi | Data & pengaturan | Saat relevan | – | versi, apa yang baru, changelog, update | Pengaturan › about | Cari · Jelajahi · Yang bisa dilakukan di sini |
| Reset data atau hapus akun | Data & pengaturan | Cari / Jelajahi | – | hapus akun, reset data, hapus semua, delete account | Pengaturan › danger | Cari · Jelajahi · Yang bisa dilakukan di sini |
| Tanya Jawab | Data & pengaturan | Selalu terlihat | – | bantuan, help, tanya jawab, faq | Menu | Cari · Jelajahi · Menu/Lainnya |
| Jelajahi Dompet Ajaib | Data & pengaturan | Selalu terlihat | – | semua fitur, jelajahi, fitur, menu lengkap | – (baru) | Cari · Jelajahi · Menu/Lainnya |

Fitur gelap (kurang dari 2 jalur): 0

