#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

if [[ ! -s .env.local ]]; then
  echo 'Konfigurasi Firebase belum ada di folder ini. Jalankan bash COBA_TANPA_INSTAL.sh untuk membuat link percobaan dari awal.' >&2
  exit 1
fi

echo 'Memperbarui aplikasi pada link percobaan Dompet Ajaib...'
if [[ ! -d node_modules ]]; then
  echo 'Menyiapkan kebutuhan build di Cloud Shell...'
  npm ci --no-audit --no-fund
fi
npm run build
firebase hosting:channel:deploy coba-dompet-ajaib --project money-manage-32467

echo 'Selesai. Buka Preview URL yang muncul di atas, lalu refresh tab aplikasi.'

echo
read -r -p 'Ketik LIVE untuk juga memperbarui alamat utama (dompetajaib.web.app); tekan Enter untuk melewati: ' live
if [[ "$live" == 'LIVE' ]]; then
  firebase deploy --only hosting --project money-manage-32467
  echo 'Alamat utama sudah diperbarui. Tutup lalu buka lagi tab aplikasi (atau tarik ke bawah untuk memuat ulang).'
fi
