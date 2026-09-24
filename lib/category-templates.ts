import type { Category } from './types';

/**
 * Starter category library. These are only templates: once added they become normal,
 * fully editable category records owned by the user. Bump the version when the library
 * changes; existing user data is never rewritten from a newer template.
 */
export const CATEGORY_TEMPLATE_VERSION = 1;

export type ColorPreset = 'peach'|'rose'|'red'|'orange'|'amber'|'yellow'|'green'|'sage'|'teal'|'cyan'|'blue'|'indigo'|'purple'|'pink'|'slate'|'gray';
export const colorPresets: { key: ColorPreset; label: string; hex: string }[] = [
  { key: 'peach', label: 'Peach', hex: '#d9825f' },
  { key: 'rose', label: 'Rose', hex: '#c2577a' },
  { key: 'red', label: 'Merah', hex: '#c9463d' },
  { key: 'orange', label: 'Oranye', hex: '#dd7324' },
  { key: 'amber', label: 'Kuning tua', hex: '#c28a0c' },
  { key: 'yellow', label: 'Kuning', hex: '#b39a12' },
  { key: 'green', label: 'Hijau', hex: '#2f9a5b' },
  { key: 'sage', label: 'Sage', hex: '#6b8f71' },
  { key: 'teal', label: 'Teal', hex: '#1f8a80' },
  { key: 'cyan', label: 'Biru muda', hex: '#1f8fae' },
  { key: 'blue', label: 'Biru', hex: '#3b6fc4' },
  { key: 'indigo', label: 'Indigo', hex: '#5557c2' },
  { key: 'purple', label: 'Ungu', hex: '#8657b8' },
  { key: 'pink', label: 'Merah muda', hex: '#c95195' },
  { key: 'slate', label: 'Abu kebiruan', hex: '#56697a' },
  { key: 'gray', label: 'Abu-abu', hex: '#7a7f86' },
];
export const presetHex = (key: ColorPreset) => colorPresets.find(preset => preset.key === key)!.hex;

export type TemplateSub = { key: string; name: string; icon: string };
export type CategoryTemplate = { key: string; type: 'expense'|'income'; name: string; icon: string; color: ColorPreset; subcategories: TemplateSub[] };

const slug = (value: string) => value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
function group(type: CategoryTemplate['type'], icon: string, name: string, color: ColorPreset, subs: string): CategoryTemplate {
  const key = `${type}.${slug(name)}`;
  const subcategories = subs.trim().split('\n').map(line => {
    const [emoji, ...words] = line.trim().split(' ');
    const subName = words.join(' ');
    return { key: `${key}.${slug(subName)}`, name: subName, icon: emoji };
  });
  return { key, type, name, icon, color, subcategories };
}

export const categoryTemplates: CategoryTemplate[] = [
  group('expense', '🍜', 'Makan & Minum', 'orange', `
    🥐 Sarapan
    🍱 Makan Siang
    🌙 Makan Malam
    🍿 Jajan
    ☕ Kopi & Minuman
    🍔 Fast Food
    🍽️ Restoran
    🥡 Delivery
    🛒 Bahan Makanan
    🍰 Lainnya`),
  group('expense', '🚗', 'Transportasi', 'blue', `
    ⛽ Bensin
    🅿️ Parkir
    🛣️ Tol
    🚌 Transportasi Umum
    🚕 Taxi / Online
    🚆 Kereta
    ✈️ Pesawat
    🚢 Kapal
    🛵 Ojek
    🚗 Sewa Kendaraan
    🧭 Lainnya`),
  group('expense', '🔧', 'Kendaraan', 'indigo', `
    🛠️ Service
    🛞 Ban
    🧴 Oli
    🔩 Spare Part
    🚿 Cuci Kendaraan
    📄 Pajak Kendaraan
    🛡️ Asuransi Kendaraan
    🚗 Aksesori Kendaraan
    🔧 Perbaikan
    🧾 Lainnya`),
  group('expense', '🏠', 'Rumah & Kebutuhan', 'sage', `
    🧹 Kebutuhan Rumah
    🧻 Perlengkapan Harian
    🪑 Furnitur
    🔨 Perbaikan Rumah
    🧺 Laundry
    🧼 Kebersihan
    🛏️ Perlengkapan Kamar
    🍳 Peralatan Dapur
    🏠 Sewa / Kost
    📦 Lainnya`),
  group('expense', '💡', 'Tagihan', 'amber', `
    ⚡ Listrik
    💧 Air
    🌐 Internet
    📱 Pulsa
    📶 Paket Data
    🔥 Gas
    🏠 Sewa / Kost
    🛡️ Asuransi
    🧾 Iuran
    📄 Tagihan Lainnya`),
  group('expense', '🎵', 'Langganan', 'purple', `
    🎵 Musik
    🎬 Film & Streaming
    ☁️ Cloud Storage
    🤖 AI / Software
    🎮 Game
    📰 Berita / Konten
    📱 Aplikasi
    💻 Software Kerja
    📦 Membership
    🔁 Lainnya`),
  group('expense', '☕', 'Nongkrong & Hiburan', 'rose', `
    ☕ Nongkrong
    🎬 Bioskop
    🎮 Gaming
    🎤 Konser
    🎳 Aktivitas
    🎟️ Tiket Hiburan
    🏖️ Rekreasi
    🎉 Acara
    🍻 Hangout
    🎈 Lainnya`),
  group('expense', '🛍️', 'Belanja', 'pink', `
    👕 Pakaian
    👟 Sepatu
    ⌚ Aksesori
    📱 Elektronik
    💻 Gadget
    🧴 Personal Care
    🧸 Hobi
    🎁 Hadiah
    📦 Marketplace
    🛒 Belanja Lainnya`),
  group('expense', '❤️', 'Kesehatan', 'red', `
    🏥 Dokter
    💊 Obat
    🧪 Laboratorium
    🦷 Gigi
    👓 Mata
    🏋️ Gym
    🧘 Wellness
    🩺 Medical Check Up
    🛡️ Asuransi Kesehatan
    ❤️ Lainnya`),
  group('expense', '🎓', 'Pendidikan', 'teal', `
    🎓 Kuliah
    📚 Buku
    📝 Kursus
    💻 Kelas Online
    🧾 Biaya Pendidikan
    ✏️ Alat Tulis
    🖨️ Print / Fotokopi
    📖 Sertifikasi
    🎒 Perlengkapan Pendidikan
    🎓 Lainnya`),
  group('expense', '🤝', 'Sosial & Sedekah', 'green', `
    🤲 Sedekah
    🎁 Hadiah
    👨‍👩‍👧 Keluarga
    💝 Donasi
    💐 Acara
    💍 Pernikahan
    🕌 Keagamaan
    🤝 Bantuan Teman
    🎂 Ulang Tahun
    ❤️ Lainnya`),
  group('expense', '💼', 'Kerja', 'slate', `
    🍱 Makan Kerja
    🚕 Transport Kerja
    🏨 Perjalanan Dinas
    🧾 Operasional
    📦 Perlengkapan Kerja
    💻 Software
    📱 Komunikasi
    🤝 Meeting
    📄 Administrasi
    💼 Lainnya`),
  group('expense', '✈️', 'Travel & Liburan', 'cyan', `
    ✈️ Tiket Pesawat
    🚆 Tiket Kereta
    🏨 Hotel
    🚕 Transport Lokal
    🍽️ Makan
    🎟️ Tiket Wisata
    🛍️ Oleh-oleh
    🧳 Perlengkapan Travel
    📄 Dokumen
    🌴 Lainnya`),
  group('expense', '👤', 'Personal', 'peach', `
    💈 Potong Rambut
    🧴 Skincare
    🧼 Perawatan Diri
    👕 Fashion
    🏋️ Fitness
    🎨 Hobi
    📚 Buku
    🎮 Gaming
    📸 Aktivitas Pribadi
    👤 Lainnya`),
  // Fees only. Moving money between the user's own wallets stays a transfer, never an expense.
  group('expense', '💸', 'Biaya Keuangan', 'gray', `
    🏦 Admin Bank
    💳 Biaya Kartu
    🔄 Biaya Transfer
    💵 Biaya Tarik Tunai
    📉 Denda
    💰 Bunga / Biaya
    🧾 Pajak
    💸 Biaya Lainnya`),
  group('expense', '📦', 'Lainnya', 'gray', `
    📌 Tak Terduga
    🧾 Biaya Lainnya
    ❓ Belum Dikategorikan`),
  group('income', '💼', 'Gaji', 'green', `
    💰 Gaji Bulanan
    ⏱️ Lembur
    🎯 Bonus
    💵 Tunjangan
    🏆 Insentif`),
  // Paying back a recorded claim still uses "Klaim cair", so it is never counted twice.
  group('income', '🧾', 'Reimbursement', 'teal', `
    💼 Claim Kantor
    🚕 Transport
    🍽️ Makan
    🏨 Perjalanan Dinas
    📦 Operasional
    🧾 Reimburse Lainnya`),
  group('income', '💰', 'Penghasilan Tambahan', 'blue', `
    💼 Freelance
    🛍️ Penjualan
    🎨 Side Project
    💻 Jasa
    🎁 Hadiah Uang
    💵 Komisi
    💰 Lainnya`),
  // Repayment of a recorded receivable still uses "Piutang dibayar" (asset recovery, not income).
  group('income', '👥', 'Uang Kembali dari Orang', 'cyan', `
    🤝 Pembayaran Piutang
    👥 Patungan
    💵 Pengembalian Uang
    🧾 Lainnya`),
  group('income', '🏦', 'Penghasilan Keuangan', 'purple', `
    💰 Bunga
    🎁 Cashback
    🏆 Reward
    💵 Dividen
    📈 Hasil Investasi
    🏦 Lainnya`),
  group('income', '📦', 'Pemasukan Lainnya', 'gray', `
    💵 Pemasukan Lainnya
    ❓ Belum Dikategorikan`),
];

/** Loose comparison so "Makan & Minum", "makan dan minum" and "Makan+Minum" count as the same. */
export const normalizeCategoryName = (name: string) => name.toLowerCase().replace(/\bdan\b/g, '&').replace(/[^a-z0-9&]+/g, '');
export function similarCategory(existing: Category[], template: CategoryTemplate) {
  const target = normalizeCategoryName(template.name);
  return existing.find(category => !category.parentId && category.type === template.type && !category.isArchived && (category.templateKey === template.key || normalizeCategoryName(category.name) === target)) || null;
}

export type SeedRecord = { id: string; data: Omit<Category, 'id'> };
/** Deterministic record id so seeding the same template twice cannot create two copies. */
export const templateDocId = (key: string, copy = '') => `tpl${CATEGORY_TEMPLATE_VERSION}_${key.replace(/[^a-z0-9]+/g, '_')}${copy}`;

/**
 * Category records to create for the chosen templates. Parents already present
 * (same template or a similar name) are skipped unless `allowSimilar` is set; in that
 * case a separate copy with its own ids is created instead of touching the existing one.
 */
export function planTemplateSeed(existing: Category[], keys: string[], allowSimilar = false, copySuffix = ''): SeedRecord[] {
  const records: SeedRecord[] = [];
  const typeCount: Record<string, number> = {};
  for (const category of existing) if (!category.parentId) typeCount[category.type] = Math.max(typeCount[category.type] ?? -1, category.sortOrder ?? 0);
  for (const template of categoryTemplates.filter(item => keys.includes(item.key))) {
    const similar = similarCategory(existing, template);
    if (similar && !allowSimilar) continue;
    const suffix = similar ? copySuffix || `_${Date.now().toString(36)}` : '';
    const parentId = templateDocId(template.key, suffix);
    const order = (typeCount[template.type] = (typeCount[template.type] ?? -1) + 1);
    records.push({ id: parentId, data: { name: template.name, type: template.type, parentId: null, icon: template.icon, color: presetHex(template.color), sortOrder: order, isArchived: false, templateKey: template.key, templateVersion: CATEGORY_TEMPLATE_VERSION } });
    template.subcategories.forEach((sub, index) => records.push({ id: templateDocId(sub.key, suffix), data: { name: sub.name, type: template.type, parentId, icon: sub.icon, color: '', sortOrder: index, isArchived: false, templateKey: sub.key, templateVersion: CATEGORY_TEMPLATE_VERSION } }));
  }
  return records;
}
