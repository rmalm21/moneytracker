#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

cat <<'TEXT'
DOMPET AJAIB — LINK PERCOBAAN TANPA INSTAL DI LAPTOP

Semua proses di bawah berjalan di Google Cloud Shell (browser), bukan di laptop.
Siapkan Firebase Console > Project settings > Your apps > Web app > Config.
Salin NILAI dari firebaseConfig satu per satu saat diminta.
Tekan Ctrl+C kapan saja untuk membatalkan.
TEXT

read_value() {
  local prompt="$1" result
  read -r -p "$prompt: " result
  if [[ -z "$result" ]]; then
    echo "Nilai tidak boleh kosong. Buka firebaseConfig lalu ulangi." >&2
    exit 1
  fi
  printf '%s' "$result"
}

api_key="$(read_value 'apiKey')"
auth_domain="$(read_value 'authDomain')"
project_id="$(read_value 'projectId')"
read -r -p 'storageBucket (boleh kosong jika belum ada): ' storage_bucket
sender_id="$(read_value 'messagingSenderId')"
app_id="$(read_value 'appId')"

if [[ "$project_id" != 'money-manage-32467' ]]; then
  echo "Project ID tidak sama dengan money-manage-32467. Periksa project yang terbuka di Firebase Console." >&2
  exit 1
fi

umask 077
cat > .env.local <<CONFIG
NEXT_PUBLIC_FIREBASE_API_KEY=$api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=$auth_domain
NEXT_PUBLIC_FIREBASE_PROJECT_ID=$project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=$storage_bucket
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=$sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=$app_id
NEXT_PUBLIC_AUTH_EMAIL_DOMAIN=gmail.com
CONFIG
unset api_key auth_domain storage_bucket sender_id app_id

echo
echo 'Langkah 1/3 — Menyiapkan aplikasi di Cloud Shell...'
npm ci --no-audit --no-fund

echo 'Langkah 2/3 — Memeriksa perhitungan dan membangun aplikasi...'
npm test
npm run build

echo
cat <<'TEXT'
Aplikasi siap dibuatkan LINK PERCOBAAN sementara di Firebase Hosting.
Target project: money-manage-32467
Target site: dompetajaib
Kanal: coba-dompet-ajaib (bukan alamat live utama)
Perintah ini hanya mengunggah situs. Aturan Firestore yang sudah ada tidak diubah.
TEXT
read -r -p 'Ketik COBA untuk membuat link percobaan; tekan Enter untuk berhenti: ' confirm
if [[ "$confirm" != 'COBA' ]]; then
  echo 'Berhenti sebelum mengunggah situs. Hasil build tetap ada di folder out/.'
  exit 0
fi

echo 'Langkah 3/3 — Membuat link percobaan...'
firebase hosting:channel:deploy coba-dompet-ajaib --project money-manage-32467

echo
cat <<'TEXT'
Selesai. Buka Preview URL yang ditampilkan tepat di atas.
Jika login gagal karena unauthorized-domain, masukkan HOST dari Preview URL
ke Firebase Console > Authentication > Settings > Authorized domains.
Jika login berhasil tetapi data gagal dimuat, cek Firestore Database > Rules.
TEXT
