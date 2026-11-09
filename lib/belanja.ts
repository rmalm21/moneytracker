/**
 * 9.7 Belanja Bijak: a week's money and a stack of things, one card at a time (right: buy, left: skip). Needs should be
 * covered, traps (flash sales, paylater, pinjol, "investasi" that promises too much) left alone, and something kept
 * aside. A purchase the money left cannot pay for does not happen. Along the way something urgent comes up (it has to
 * be paid: without money kept aside it becomes a debt) and some extra money comes in.
 * Five scenarios, each round deals a different hand from a bigger pool. At the end: a score (0–100), stars, a 50/30/20
 * report, the decisions that were right, and tips. Pure: the screen deals and animates.
 */
export type ShopKind = 'need' | 'want' | 'trap' | 'urgent' | 'bonus';
export type ShopItem = { id: string; name: string; emoji: string; price: number; kind: ShopKind; note: string };
export type Scenario = { id: string; title: string; who: string; budget: number; emoji: string; items: ShopItem[] };
const i = (id: string, name: string, emoji: string, price: number, kind: ShopKind, note: string): ShopItem => ({ id, name, emoji, price, kind, note });

export const SCENARIOS: Scenario[] = [
  { id: 'kos', title: 'Anak kos', who: 'Uang mingguan anak kos', budget: 200_000, emoji: '🏠', items: [
    i('galon', 'Isi ulang galon', '💧', 20_000, 'need', 'Air minum itu wajib.'),
    i('laundry', 'Laundry kiloan', '🧺', 30_000, 'need', 'Baju bersih buat seminggu.'),
    i('token', 'Token listrik', '💡', 40_000, 'need', 'Tanpa listrik, kos gelap gulita.'),
    i('makan', 'Makan siang 3 hari', '🍱', 40_000, 'need', 'Makan itu kebutuhan.'),
    i('sabun', 'Sabun dan sampo', '🧴', 25_000, 'need', 'Kebutuhan mandi.'),
    i('angkot', 'Ongkos angkot seminggu', '🚌', 25_000, 'need', 'Biar bisa berangkat.'),
    i('boba', 'Boba gula aren', '🧋', 25_000, 'want', 'Enak, tapi bukan kebutuhan.'),
    i('mieayam', 'Mie ayam spesial', '🍜', 18_000, 'want', 'Sesekali boleh.'),
    i('bioskop', 'Nonton bioskop', '🎬', 45_000, 'want', 'Hiburan, pas kalau masih ada sisa.'),
    i('kue', 'Patungan kue ultah teman', '🍰', 30_000, 'want', 'Baik, asal kebutuhan aman.'),
    i('kopi', 'Kopi susu kekinian', '☕', 20_000, 'want', 'Kecil-kecil, lama-lama jadi bukit.'),
    i('jaket', 'Jaket diskon 20%', '🧥', 60_000, 'want', 'Diskon kecil tetap belanja.'),
    i('sepatu', 'Flash sale sepatu diskon 70%', '👟', 150_000, 'trap', 'Diskon besar tetap belanja kalau nggak butuh.'),
    i('topup', 'Top up game', '🎮', 75_000, 'trap', 'Top up game cepat bikin uang mingguan habis.'),
    i('paylater', 'Paylater earphone, cicil 3×', '💳', 60_000, 'trap', 'Paylater itu utang. Cicilannya nempel ke bulan depan.'),
    i('ongkir', 'Tambah barang biar gratis ongkir', '📦', 70_000, 'trap', 'Hemat ongkir Rp10rb, tapi belanja Rp70rb yang nggak perlu.'),
    i('streaming', 'Langganan streaming ketiga', '📺', 55_000, 'trap', 'Langganan yang jarang dipakai itu bocor halus.'),
    i('ban', 'Ban sepeda bocor', '🔧', 25_000, 'urgent', 'Kejadian mendadak. Untung ada uang yang disisakan.'),
    i('obat', 'Obat sakit kepala', '💊', 15_000, 'urgent', 'Sakit nggak bisa ditunda.'),
    i('kiriman', 'Kiriman tambahan dari rumah', '💌', 40_000, 'bonus', 'Uang tambahan. Enaknya ditabung.'),
    i('panitia', 'Honor jadi panitia acara', '💼', 30_000, 'bonus', 'Hasil kerja sendiri, simpan sebagian.'),
  ] },
  { id: 'kantor', title: 'Pekerja kantoran', who: 'Jatah seminggu pekerja kantoran', budget: 350_000, emoji: '💼', items: [
    i('bensin', 'Bensin seminggu', '⛽', 50_000, 'need', 'Biar bisa berangkat kerja.'),
    i('makansiang', 'Makan siang 5 hari', '🍱', 90_000, 'need', 'Makan siang tiap hari kerja.'),
    i('kuota', 'Kuota internet', '📱', 50_000, 'need', 'Buat kerja dan kabar keluarga.'),
    i('sabun', 'Sabun dan sampo', '🧴', 35_000, 'need', 'Kebutuhan mandi.'),
    i('parkir', 'Parkir seminggu', '🅿️', 25_000, 'need', 'Biaya rutin ke kantor.'),
    i('token', 'Token listrik', '💡', 40_000, 'need', 'Listrik rumah harus nyala.'),
    i('kopi', 'Kopi kekinian', '☕', 32_000, 'want', 'Sekali dua kali wajar.'),
    i('pizza', 'Pizza Jumat', '🍕', 70_000, 'want', 'Hiburan akhir pekan.'),
    i('film', 'Nonton film baru', '🎬', 50_000, 'want', 'Boleh kalau masih ada sisa.'),
    i('roti', 'Roti buat sarapan', '🍞', 20_000, 'want', 'Sarapan hemat, tapi tetap tambahan.'),
    i('makanbareng', 'Makan bareng teman kantor', '🍜', 60_000, 'want', 'Seru, asal nggak tiap hari.'),
    i('skincare', 'Skincare baru', '🧴', 45_000, 'want', 'Yang lama masih ada? Habiskan dulu.'),
    i('baju', 'Flash sale baju, tinggal 2 jam!', '🛍️', 120_000, 'trap', 'Hitung mundur dibuat biar kamu buru-buru belanja.'),
    i('game', 'Top up game event', '🎮', 100_000, 'trap', 'Event game datang tiap minggu, uangmu nggak.'),
    i('cicil', 'Paylater jam tangan, DP Rp80rb', '💳', 80_000, 'trap', 'DP kecil, cicilannya panjang.'),
    i('ongkir', 'Belanja minimal Rp150rb biar gratis ongkir', '📦', 85_000, 'trap', 'Gratis ongkirnya mahal kalau barangnya nggak perlu.'),
    i('bodong', 'Investasi untung 10% seminggu', '📈', 100_000, 'trap', 'Untung tinggi, cepat, dan pasti itu ciri investasi bodong.'),
    i('ban', 'Ban motor bocor', '🔧', 40_000, 'urgent', 'Mendadak. Dana darurat menyelamatkan.'),
    i('flu', 'Obat flu dan vitamin', '💊', 30_000, 'urgent', 'Kesehatan nggak bisa ditunda.'),
    i('lembur', 'Uang lembur', '💰', 60_000, 'bonus', 'Hasil kerja keras, sisihkan buat tabungan.'),
    i('jualbekas', 'Jual barang bekas', '💸', 50_000, 'bonus', 'Barang nganggur jadi uang. Mantap.'),
  ] },
  { id: 'kampus', title: 'Mahasiswa', who: 'Uang saku mahasiswa seminggu', budget: 150_000, emoji: '🎓', items: [
    i('bus', 'Ongkos bus seminggu', '🚌', 30_000, 'need', 'Biar bisa ke kampus.'),
    i('fotokopi', 'Fotokopi materi kuliah', '📄', 15_000, 'need', 'Buat belajar.'),
    i('makan4', 'Makan siang 4 hari', '🍜', 40_000, 'need', 'Perut kenyang, otak jalan.'),
    i('kuota', 'Kuota internet', '📱', 25_000, 'need', 'Buat kuliah online dan tugas.'),
    i('alattulis', 'Buku tulis dan pulpen', '📝', 15_000, 'need', 'Alat belajar.'),
    i('sabuncuci', 'Sabun cuci baju', '🧺', 12_000, 'need', 'Biar bisa nyuci sendiri.'),
    i('boba2', 'Boba sepulang kuliah', '🧋', 22_000, 'want', 'Enak, tapi bukan kebutuhan.'),
    i('nonton', 'Tiket nonton', '🎬', 40_000, 'want', 'Hiburan, kalau masih ada sisa.'),
    i('roti2', 'Roti bakar malam', '🍞', 12_000, 'want', 'Jajan kecil, tapi rajin nambah.'),
    i('kue2', 'Kue buat teman sekelas', '🍰', 25_000, 'want', 'Baik, asal kebutuhan aman.'),
    i('gantungan', 'Gantungan kunci lucu', '🔑', 15_000, 'want', 'Lucu, tapi nggak wajib.'),
    i('kopi2', 'Es kopi susu', '☕', 18_000, 'want', 'Sesekali boleh.'),
    i('game2', 'Top up game diskon', '🎮', 50_000, 'trap', 'Diskon top up tetap bikin uang saku tekor.'),
    i('skincare', 'Flash sale skincare', '🛍️', 60_000, 'trap', 'Belanja karena takut kehabisan, bukan karena butuh.'),
    i('pl', 'Paylater sepatu, DP Rp45rb', '💳', 45_000, 'trap', 'Paylater itu utang, bukan diskon.'),
    i('pinjol', 'Pinjol cair 5 menit', '📲', 50_000, 'trap', 'Pinjol ilegal bunganya mencekik dan datamu bisa disebar.'),
    i('ongkir2', 'Tambah barang biar gratis ongkir', '📦', 40_000, 'trap', 'Hemat ongkir, boros belanja.'),
    i('charger', 'Charger HP rusak', '🔌', 25_000, 'urgent', 'HP buat kuliah, harus diganti.'),
    i('kas', 'Iuran kas kelas mendadak', '🧾', 20_000, 'urgent', 'Kewajiban mendadak.'),
    i('lomba', 'Menang lomba esai', '🏆', 30_000, 'bonus', 'Hadiah prestasi! Tabung sebagian.'),
    i('asdos', 'Upah bantu dosen', '💼', 25_000, 'bonus', 'Penghasilan tambahan, mantap.'),
  ] },
  { id: 'keluarga', title: 'Belanja keluarga', who: 'Uang belanja mingguan keluarga', budget: 600_000, emoji: '🏡', items: [
    i('beras', 'Beras 5 kg', '🍚', 75_000, 'need', 'Makanan pokok keluarga.'),
    i('lauk', 'Sayur dan lauk seminggu', '🥦', 150_000, 'need', 'Gizi keluarga nomor satu.'),
    i('minyak', 'Minyak goreng', '🍳', 40_000, 'need', 'Buat masak tiap hari.'),
    i('susu', 'Susu anak', '🍼', 60_000, 'need', 'Kebutuhan anak.'),
    i('gas', 'Gas elpiji', '🔥', 25_000, 'need', 'Tanpa gas, nggak bisa masak.'),
    i('deterjen', 'Sabun dan deterjen', '🧴', 45_000, 'need', 'Kebutuhan rumah.'),
    i('martabak', 'Martabak manis', '🥞', 40_000, 'want', 'Camilan keluarga, sesekali boleh.'),
    i('jajan', 'Jajan anak', '🍭', 25_000, 'want', 'Secukupnya saja.'),
    i('bioskop', 'Nonton bioskop sekeluarga', '🎬', 120_000, 'want', 'Hiburan bareng, kalau masih ada sisa.'),
    i('mainan', 'Mainan baru', '🧸', 75_000, 'want', 'Mainan lama masih ada?'),
    i('makanluar', 'Makan di luar', '🍽️', 150_000, 'want', 'Masak di rumah jauh lebih hemat.'),
    i('bajubaru', 'Baju baru', '👕', 100_000, 'want', 'Kalau yang lama masih layak, tunda dulu.'),
    i('panci', 'Flash sale panci set', '🛍️', 250_000, 'trap', 'Panci di rumah masih bagus? Itu cuma lapar mata.'),
    i('kulkas', 'Paylater kulkas baru, DP Rp200rb', '💳', 200_000, 'trap', 'Cicilan panjang buat barang yang belum perlu.'),
    i('beli3', 'Promo beli 3 bayar 2 barang yang jarang dipakai', '📦', 90_000, 'trap', 'Promo cuma hemat kalau barangnya memang dipakai.'),
    i('bodong2', 'Investasi untung pasti 20% sebulan', '📈', 200_000, 'trap', 'Untung pasti dan tinggi itu ciri investasi bodong.'),
    i('tvkabel', 'Upgrade TV kabel paket premium', '📺', 120_000, 'trap', 'Langganan mahal yang jarang ditonton.'),
    i('klinik', 'Anak demam, ke klinik', '🏥', 80_000, 'urgent', 'Kesehatan anak nggak bisa ditunda.'),
    i('genteng', 'Genteng bocor', '🔧', 70_000, 'urgent', 'Perbaikan mendadak, untung ada simpanan.'),
    i('arisan', 'Uang arisan cair', '💰', 100_000, 'bonus', 'Uang masuk. Jangan langsung habis ya.'),
    i('kue', 'Jualan kue titipan', '🧁', 60_000, 'bonus', 'Penghasilan tambahan keluarga.'),
  ] },
  { id: 'freelance', title: 'Freelancer', who: 'Bayaran mingguan freelancer', budget: 400_000, emoji: '💻', items: [
    i('kuota', 'Kuota internet', '📶', 60_000, 'need', 'Alat kerja utama.'),
    i('token', 'Token listrik', '💡', 50_000, 'need', 'Laptop butuh listrik.'),
    i('makan7', 'Makan seminggu', '🍱', 140_000, 'need', 'Makan itu kebutuhan.'),
    i('bensin', 'Bensin ketemu klien', '⛽', 50_000, 'need', 'Biaya kerja.'),
    i('bpjs', 'Sisihkan iuran BPJS', '🏥', 35_000, 'need', 'Perlindungan kesehatan itu penting.'),
    i('galon', 'Air galon', '💧', 20_000, 'need', 'Air minum wajib.'),
    i('kafe', 'Kerja di kafe sambil ngopi', '☕', 35_000, 'want', 'Boleh sesekali buat suasana baru.'),
    i('musik', 'Langganan musik', '🎧', 25_000, 'want', 'Hiburan, pastikan dipakai.'),
    i('headset', 'Headset baru', '🎧', 80_000, 'want', 'Yang lama masih jalan? Tunda dulu.'),
    i('makanenak', 'Makan enak akhir pekan', '🍣', 60_000, 'want', 'Hadiah buat diri sendiri, secukupnya.'),
    i('nonton', 'Nonton film', '🎬', 50_000, 'want', 'Hiburan kalau ada sisa.'),
    i('camilan', 'Camilan buat begadang', '🍿', 20_000, 'want', 'Kecil, tapi rutin.'),
    i('laptop', 'Laptop baru paylater 12×', '💳', 150_000, 'trap', 'Cicilan 12 bulan buat yang belum perlu.'),
    i('kursus', 'Kursus "cepat kaya" online', '📈', 120_000, 'trap', 'Janji cepat kaya biasanya cuma kaya buat penjualnya.'),
    i('topup', 'Top up game', '🎮', 80_000, 'trap', 'Hiburan yang gampang bikin kebablasan.'),
    i('keyboard', 'Flash sale keyboard gaming', '⌨️', 130_000, 'trap', 'Keyboard lama masih jalan, ini cuma lapar mata.'),
    i('pinjol', 'Pinjol cair cepat', '📲', 100_000, 'trap', 'Bunga pinjol ilegal bikin utang beranak.'),
    i('servis', 'Laptop perlu servis', '🔧', 50_000, 'urgent', 'Alat kerja rusak harus segera dibetulkan.'),
    i('ban', 'Ban motor bocor', '🔧', 40_000, 'urgent', 'Mendadak. Dana darurat menyelamatkan.'),
    i('proyek', 'Klien bayar proyek kecil', '💰', 100_000, 'bonus', 'Penghasilan freelancer naik turun, tabung sebagian.'),
    i('tip', 'Tip dari klien', '💸', 60_000, 'bonus', 'Bonus! Enaknya disimpan.'),
  ] },
];

const shuffled = <T>(list: T[], rand: () => number) => { const a = [...list]; for (let k = a.length - 1; k > 0; k--) { const j = Math.floor(rand() * (k + 1)); [a[k], a[j]] = [a[j], a[k]]; } return a; };
export const ROUND_MIX = { need: 4, want: 4, trap: 3, urgent: 1, bonus: 1 } as const;
/** A round: a scenario and a hand from its pool (4 needs, 4 wants, 3 traps, 1 urgent, 1 bonus). The first card is a need
 * or a want, and the urgent thing comes in the second half (after some money is spent). */
export function dealRound(rand: () => number, scenarioId?: string): { scenario: Scenario; cards: ShopItem[] } {
  const scenario = SCENARIOS.find(s => s.id === scenarioId) || SCENARIOS[Math.floor(rand() * SCENARIOS.length)];
  const hand = (Object.keys(ROUND_MIX) as ShopKind[]).flatMap(kind => shuffled(scenario.items.filter(x => x.kind === kind), rand).slice(0, ROUND_MIX[kind]));
  const urgent = hand.filter(c => c.kind === 'urgent'), rest = shuffled(hand.filter(c => c.kind !== 'urgent'), rand);
  const first = rest.findIndex(c => c.kind === 'need' || c.kind === 'want'); if (first > 0) [rest[0], rest[first]] = [rest[first], rest[0]];
  const half = Math.ceil(rest.length / 2);
  for (const u of urgent) rest.splice(half + Math.floor(rand() * (rest.length - half + 1)), 0, u);
  return { scenario, cards: rest };
}

const rupiah = (n: number) => `Rp${Math.round(n).toLocaleString('id-ID')}`;
export type Verdict = { tone: 'good' | 'ok' | 'bad'; text: string };
/** What a decision says right away (shown for a moment under the card). */
export function verdict(card: ShopItem, buy: boolean, paidFully = true): Verdict {
  if (card.kind === 'bonus') return { tone: 'good', text: `Uang masuk +${rupiah(card.price)}. ${card.note}` };
  if (card.kind === 'urgent') return paidFully ? { tone: 'good', text: `Kebayar. ${card.note}` } : { tone: 'bad', text: 'Uangnya nggak cukup, terpaksa ngutang. Sisakan dana darurat ya.' };
  if (card.kind === 'need') return buy ? { tone: 'good', text: `Tepat! ${card.note}` } : { tone: 'bad', text: `Eh, ini kebutuhan. ${card.note}` };
  if (card.kind === 'trap') return buy ? { tone: 'bad', text: `Kena godaan! ${card.note}` } : { tone: 'good', text: `Mantap, nggak kepancing. ${card.note}` };
  return buy ? { tone: 'ok', text: `Boleh. ${card.note}` } : { tone: 'good', text: `Hemat! ${card.note}` };
}

export type ShopResult = {
  score: number; stars: number; spent: number; left: number; income: number; total: number;
  needsGot: number; needsTotal: number; trapsBought: ShopItem[]; wantsBought: number; needsMissed: ShopItem[]; blocked: ShopItem[];
  urgentPaid: boolean; debt: number; good: number; decisions: number;
  /** The 50/30/20 report: shares of all the money that went to needs (with the urgent thing), wants (with traps), and what is left. */
  split: { needs: number; wants: number; saved: number };
  title: string; tips: string[];
};
/** The score (0–100): needs covered (40), traps left alone (20), the urgent thing paid without debt (15), money kept
 * aside (25: a fifth of all the money or more; cut when a need was missed). A trap said yes to counts even when the
 * money left could not pay for it. */
export function scoreRound(scenario: Scenario, cards: ShopItem[], buys: boolean[]): ShopResult {
  let left = scenario.budget, income = 0, debt = 0, urgentPaid = true, needSpent = 0, wantSpent = 0, good = 0, decisions = 0;
  const bought: ShopItem[] = [], blocked: ShopItem[] = [];
  cards.forEach((c, k) => {
    if (c.kind === 'bonus') { left += c.price; income += c.price; return; }
    if (c.kind === 'urgent') { if (c.price > left) { debt += c.price - left; needSpent += left; left = 0; urgentPaid = false; } else { left -= c.price; needSpent += c.price; } return; }
    decisions++;
    const buy = Boolean(buys[k]);
    if (verdict(c, buy).tone === 'good') good++;
    if (!buy) return;
    if (c.price > left) { blocked.push(c); return; }
    left -= c.price; bought.push(c);
    if (c.kind === 'need') needSpent += c.price; else wantSpent += c.price;
  });
  const needs = cards.filter(c => c.kind === 'need'), traps = cards.filter(c => c.kind === 'trap'), urgent = cards.some(c => c.kind === 'urgent');
  const needsGot = bought.filter(c => c.kind === 'need').length, trapsBought = cards.filter((c, k) => buys[k] && c.kind === 'trap');
  const needsMissed = needs.filter(n => !bought.includes(n)), total = scenario.budget + income;
  const needScore = 40 * (needs.length ? needsGot / needs.length : 1);
  const trapScore = 20 * (traps.length ? (traps.length - trapsBought.length) / traps.length : 1);
  const urgentScore = urgent ? (urgentPaid ? 15 : 0) : 15;
  const saveScore = 25 * Math.min(1, left / (total * 0.2)) * (needsGot === needs.length ? 1 : 0.4);
  const score = Math.round(needScore + trapScore + urgentScore + saveScore);
  const tips = [
    ...(debt ? [`Kejadian mendadak bikin ngutang ${rupiah(debt)}. Sisakan dana darurat sebelum beli keinginan.`] : []),
    ...needsMissed.map(n => `${n.name} kelewat. ${n.note}`),
    ...trapsBought.map(t => `${t.name}: ${t.note}`),
    ...(blocked.length ? [`Uangnya nggak cukup buat ${blocked.map(b => b.name.toLowerCase()).join(', ')}. Dahulukan kebutuhan.`] : []),
  ];
  if (!tips.length) tips.push(left >= total * 0.2 ? 'Kebutuhan aman, godaan lewat, darurat kebayar, dan masih ada tabungan. Mantap!' : 'Kebutuhan aman dan godaan lewat. Coba sisakan sedikit lebih banyak buat ditabung.');
  const pct = (n: number) => total ? Math.round(n / total * 100) : 0;
  const title = score >= 95 ? 'Bijak banget!' : score >= 80 ? 'Mantap, bijak' : score >= 60 ? 'Lumayan, masih bisa lebih hemat' : 'Waduh, boros nih';
  return { score, stars: shopStars(score), spent: total - left, left, income, total, needsGot, needsTotal: needs.length, trapsBought, wantsBought: bought.filter(c => c.kind === 'want').length,
    needsMissed, blocked, urgentPaid, debt, good, decisions, split: { needs: pct(needSpent), wants: pct(wantSpent), saved: pct(left) }, title, tips: tips.slice(0, 3) };
}
export const SHOP_STAR = [60, 80, 95] as const;
export const shopStars = (score: number) => score >= SHOP_STAR[2] ? 3 : score >= SHOP_STAR[1] ? 2 : score >= SHOP_STAR[0] ? 1 : 0;

// ——— The day's mission ———
export type ShopMission = { id: string; text: string };
export const SHOP_MISSIONS: ShopMission[] = [
  { id: 'tanpa-godaan', text: 'Lewati semua godaan' },
  { id: 'sisa30', text: 'Penuhi kebutuhan dan sisakan 30% uang' },
  { id: 'skor85', text: 'Dapat skor 85 ke atas' },
  { id: 'darurat', text: 'Bayar kejadian darurat tanpa ngutang, kebutuhan lengkap' },
];
const hashOf = (text: string) => { let h = 2166136261; for (let k = 0; k < text.length; k++) { h ^= text.charCodeAt(k); h = Math.imul(h, 16777619); } return h >>> 0; };
export const shopMission = (seed: string, day: string): ShopMission => SHOP_MISSIONS[hashOf(`${seed}:${day}:belanja`) % SHOP_MISSIONS.length];
export function shopMissionDone(m: ShopMission, r: ShopResult) {
  if (m.id === 'tanpa-godaan') return r.trapsBought.length === 0;
  if (m.id === 'sisa30') return r.needsGot === r.needsTotal && r.left >= r.total * 0.3;
  if (m.id === 'skor85') return r.score >= 85;
  return r.urgentPaid && r.needsGot === r.needsTotal;
}
