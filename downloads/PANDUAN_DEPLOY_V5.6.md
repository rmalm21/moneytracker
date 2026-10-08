# Dompet Ajaib v5.6 — download dan deploy

[Download ZIP 3,5 MB](https://github.com/rmalm21/moneytracker/raw/refs/heads/codex/dompetajaib-v5.6-downloads/downloads/DompetAjaib_v5.6_deploy_sekali_jalan.zip)

Buka Google Cloud Shell di project `money-manage-32467`, copy seluruh blok berikut, paste, lalu tekan Enter. File diambil langsung dari GitHub; tidak perlu upload manual.

```bash
bash <<'DEPLOY'
set -e
DOMPET_DIR="$(mktemp -d /tmp/dompetajaib-deploy-XXXXXX)"
curl -fL --retry 3 'https://raw.githubusercontent.com/rmalm21/moneytracker/codex/dompetajaib-v5.6-downloads/downloads/DompetAjaib_v5.6_deploy_sekali_jalan.zip' -o "$DOMPET_DIR/app.zip"
echo "61c6fdbb8444ceb66c8d5db868d09bc556444cee119d5f6c96ee0b5fdd3502ac  $DOMPET_DIR/app.zip" | sha256sum -c -
unzip -q "$DOMPET_DIR/app.zip" -d "$DOMPET_DIR"
bash "$DOMPET_DIR/dompet-ajaib/DEPLOY_SEKALI_JALAN.sh"
DEPLOY
```

Tunggu sampai muncul `SELESAI — https://dompetajaib.web.app`. Buka halaman tersebut, refresh, lalu periksa versi 5.6.

Paket ini memuat:
- Split saldo bisnis/pribadi dalam satu dompet.
- Perbaikan edit tanggal pembayaran Split Bill ketika piutang sudah lunas.
- Perbaikan lapisan menu Lainnya pada kartu utang/piutang.
- Ringkasan utang/piutang menghitung catatan aktif saja.
- Script deployment satu kali paste, konfigurasi Firebase otomatis, dan panduan.

Validasi: 700 kasus tes lulus. Typecheck dan build aplikasi lulus. Alur deployment diuji memakai simulasi lokal; deployment ke akun Firebase pengguna belum dilakukan. Screenshot aplikasi dan pemeriksaan tampilan menu di browser belum berhasil karena browser lingkungan ini gagal berjalan.

ZIP lengkap beserta laporan dan bukti validasi ada di dalam arsip. SHA256:
`61c6fdbb8444ceb66c8d5db868d09bc556444cee119d5f6c96ee0b5fdd3502ac`
