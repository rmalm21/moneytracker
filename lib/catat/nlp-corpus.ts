/**
 * Catat otomatis V3 — training sentences for the NLP.js intent model (Engine B).
 *
 * Hand-written casual Indonesian, plus the single-action sentences of the original benchmark set (bench/quick/fixtures.mjs,
 * "set utama" only) added by scripts/build-nlp-model.mjs. The V3 development and held-out sets are NOT used here, so
 * NLP.js is measured on sentences it never saw. Few intents on purpose (no micro-intents).
 */
export const NLP_INTENTS = ['expense', 'income', 'transfer', 'debt_creation', 'debt_payment', 'receivable_creation', 'receivable_payment', 'claim_creation', 'claim_payment', 'reminder', 'planned_transaction', 'recurring_transaction', 'balance_statement', 'unknown'] as const;
export type NlpIntent = typeof NLP_INTENTS[number];

export const CORPUS: Record<NlpIntent, string[]> = {
  expense: ['beli kopi 25rb', 'makan siang 30rb', 'jajan bakso 15rb', 'isi bensin 50rb', 'bayar parkir 5rb', 'ngopi di kafe 40rb', 'beli sabun sama sampo 35rb', 'gorengan 10rb cash', 'langganan netflix 54rb', 'beli pulsa 25rb', 'servis motor 150rb', 'ongkos ojol 18rb', 'nraktir temen 80rb', 'belanja sayur 45rb', 'bayar listrik 300rb', 'makan malam bareng 120rb', 'beli obat 35rb', 'potong rambut 40rb', 'jajan es teh 5rb', 'beli buku 90rb'],
  income: ['gajian 5jt', 'gaji masuk 7jt', 'dapat bonus 1jt', 'terima transferan klien 2jt', 'dapet uang jualan 300rb', 'thr cair 4jt', 'cashback masuk 15rb', 'hasil freelance 1,5jt', 'dikasih uang jajan 100rb', 'jual hp bekas 1jt', 'komisi masuk 250rb', 'bunga deposito 50rb'],
  transfer: ['transfer dari bca ke gopay 100rb', 'tf 200rb ke rekening sendiri', 'pindahin saldo ke tabungan', 'top up gopay 50rb', 'isi saldo ovo 100rb', 'tarik tunai 500rb', 'setor tunai 1jt', 'pindah dana ke rekening lain', 'topup emoney 100rb', 'kirim ke dompet sendiri 300rb'],
  debt_creation: ['pinjam uang ke andi 500rb', 'minjem 200rb dari budi', 'ngutang ke warung 50rb', 'dipinjemin kakak 1jt', 'kasbon kantor 2jt', 'utang ke teman 300rb', 'pakai paylater 400rb', 'dipinjami ibu 500rb'],
  debt_payment: ['bayar utang ke andi 200rb', 'cicil pinjaman 500rb', 'bayar cicilan motor 1jt', 'lunasin utang budi', 'balikin uang andi 100rb', 'angsuran kredit hp 350rb', 'bayar paylater 400rb', 'nyicil hutang 150rb'],
  receivable_creation: ['minjemin teman 100rb', 'kasih pinjem adik 50rb', 'talangin makan temen 45rb', 'nalangin tiket konser 750rb', 'bayarin dulu makan dodi 60rb', 'pinjemin uang ke rina', 'utangin tetangga 200rb'],
  receivable_payment: ['andi bayar utangnya 100rb', 'temen balikin uang 50rb', 'dibayar dodi 60rb', 'rina udah lunas', 'terima pembayaran dari tetangga 200rb', 'uang yang dipinjam sudah dikembaliin'],
  claim_creation: ['klaim kantor bensin dinas 200rb', 'reimburse makan klien 300rb', 'talangin kantor tiket pesawat 1,2jt', 'pengeluaran dinas buat diklaim 500rb', 'nalangin biaya kantor 150rb'],
  claim_payment: ['klaim kantor cair 1,2jt', 'reimburse udah cair', 'uang dinas diganti kantor', 'klaim hotel sudah dibayar', 'penggantian kantor masuk 500rb'],
  reminder: ['ingetin bayar wifi tanggal 5', 'jangan lupa tagih andi', 'pengingat perpanjang stnk', 'catatan bayar pajak motor', 'ingatkan transfer ke ibu besok'],
  planned_transaction: ['rencana beli sepatu 500rb minggu depan', 'besok mau bayar kos 1jt', 'nanti beli kado 200rb', 'rencana servis mobil bulan depan 1,5jt', 'lusa bayar arisan 100rb'],
  recurring_transaction: ['tiap bulan bayar kos 1,5jt', 'setiap tanggal 1 bayar internet 300rb', 'langganan spotify per bulan 55rb', 'tiap minggu isi bensin 100rb', 'bayar bpjs bulanan 150rb'],
  balance_statement: ['saldo bca sekarang 2jt', 'gopay tinggal 50rb', 'sisa uang di dompet 100rb', 'saldo jago 1,2jt', 'uang cash tinggal 75rb'],
  unknown: ['halo', 'apa kabar', 'ini apa ya', 'buka laporan', 'lihat anggaran', 'cara pakai aplikasi', 'tes', 'mantap'],
};

/**
 * 6.0 preparation: the model learns who does what. A person the records know is replaced before reading: the one doing
 * it, first in the clause ("{subjek} ngutang 20rb": they owe me), or the other party ("ngutang ke {orang} 50rb": I owe
 * them); a bag of words cannot tell those apart by itself. Plus "food, amount, wallet" spending (not a balance), the
 * normalized 2.0 language (what lib/catat/language.ts writes) and English that stays English.
 * Written fresh: no sentence of a development or held-out set.
 */
export const PERSON_SUBJECT = 'xsubjek', PERSON_OTHER = 'xorang';
/** "ke aku / dari aku / sama aku": me as the other party (they borrow from me), unlike "aku ngutang" (I borrow). */
export const featureText = (s: string) => s.replace(/\b(?:ke|dari|sama|ama)\s+(?:aku|saya)\b/g, 'xkeaku');
export const CORPUS_V60: Partial<Record<NlpIntent, string[]>> = {
  expense: [
    'nasi padang 28rb', 'mie ayam 15rb gopay', 'kopi susu 18rb jenius', 'es teh manis 5rb cash', 'soto ayam 20rb bca', 'bubur ayam 12rb ovo',
    'sate kambing 45rb mandiri', 'seblak 15rb dana', 'pecel lele 22rb cash', 'roti bakar 25rb shopeepay', 'cukur rambut 35rb bri', 'nasi uduk 10rb krom',
    'terang bulan 35rb di pak budi gopay', 'ayam geprek 18rb di warung bu sri', 'deterjen 22rb di alfamart', 'beli nasi bungkus 12rb', 'beli sayur 20rb di pasar',
    'beli ikan 35rb cash', 'token listrik 200rb jago', 'bayar tagihan wifi 275rb', 'beli sepatu lari 400rb', 'beli pakaian 150rb', 'tebus obat flu 25rb',
    'bensin 30rb pertamina', 'isi bensin 40rb shell', 'grab ke mall 32rb', 'gojek ke stasiun 15rb', 'parkir mobil 10rb', 'tol 15rb etoll',
    'jajan cilok 5rb', 'makan bakso urat 25rb', 'minum es kelapa 10rb', 'traktir pacar 150rb', 'bayar kos bulan ini 900rb', 'sewa motor 100rb', 'tiket bus 120rb', 'tiket konser 500rb',
    'coffee 30k gopay', 'groceries 350k', 'snack 15k', 'movie ticket 50k', 'haircut 40k', 'laundry 35k',
  ],
  income: [
    'gaji bulan ini 7jt masuk bri', 'terima gaji 6,5jt', 'dapat transferan klien 900rb', 'bonus akhir tahun 3jt masuk',
    'thr 5jt masuk bca', 'hasil jualan online 450rb', 'dapat hadiah lomba 500rb', 'dividen saham 120rb', 'dapat 100rb dari {orang}', 'dikasih {orang} 200rb',
    'terima 300rb dari jualan', 'income project 4jt', 'dapat fee desain 750rb',
  ],
  transfer: [
    'transfer ke ovo 150rb dari bri', 'tf ke mandiri 500rb dari bca', 'pindah 750rb dari krom ke jenius', 'top up ovo 50rb pakai bca', 'isi gopay 200rb dari mandiri',
    'tarik tunai 300rb di atm bri', 'setor tunai 500rb ke jago', 'transfer to savings 500k', 'transfer 300rb bri ke dana', 'top up dana 75rb', 'kirim ke rekening tabungan 1jt',
  ],
  debt_creation: [
    'ngutang ke {orang} 50rb', 'pinjam uang ke {orang} 300rb', 'minjem 100rb ke {orang}', 'aku ngutang ke {orang} 200rb', 'aku pinjam 1jt dari {orang}',
    'dipinjemin {orang} 150rb', 'utang ke {orang} 75rb buat makan', 'kasbon ke {orang} 500rb', 'aku minjem duit {orang} 50rb', 'pinjem 20rb sama {orang}',
    'aku ngutang ke warung 30rb', 'pinjam ke koperasi 2jt', 'utang paylater 350rb', 'teman minjemin aku 100rb', 'kakak minjemin aku 500rb', 'dipinjemin teman 200rb',
  ],
  debt_payment: [
    'bayar utang ke {orang} 100rb', 'aku balikin uang {orang} 50rb', 'lunasin utang ke {orang}', 'nyicil utang ke {orang} 200rb', 'aku bayar ke {orang} 75rb utangnya',
    'cicil ke {orang} 100rb', 'transfer ke {orang} buat bayar utang 300rb', 'bayar cicilan hp 400rb', 'bayar kartu kredit 1,2jt', 'lunasin paylater 250rb',
  ],
  receivable_creation: [
    '{subjek} ngutang 20rb', '{subjek} ngutang 50rb buat makan', '{subjek} minjem 100rb', '{subjek} pinjam 200rb ke aku', '{subjek} ngutang ke aku 30rb',
    '{subjek} minjem duit 75rb buat bensin', '{subjek} pinjem 40rb', '{subjek} kasbon 100rb', 'pinjemin {orang} 50rb', 'minjemin {orang} 100rb pakai jago',
    'talangin {orang} makan 45rb', 'bayarin {orang} parkir 5rb', 'kasih pinjam {orang} 150rb', 'utangin {orang} 60rb',
    'aku minjemin adik 100rb', 'aku minjemin teman kantor 200rb', 'minjemin temen 50rb buat makan', 'temen minjem 100rb ke aku', 'teman ngutang ke aku 50rb', 'adik pinjam 200rb ke aku', 'dia ngutang 25rb', 'dia minjem 50rb ke aku', 'kakak pinjem 300rb ke aku',
  ],
  receivable_payment: [
    '{subjek} bayar 20rb', '{subjek} balikin 50rb', '{subjek} lunasin utangnya', '{subjek} transfer 100rb', '{subjek} bayar utang 30rb',
    '{subjek} udah bayar 75rb', '{subjek} transfer balik 40rb', '{subjek} nyicil 25rb', '{subjek} balikin duit 60rb', '{subjek} transfer balik 75rb ke bca', '{subjek} udah lunas',
    'dibayar {orang} 50rb', 'dibalikin {orang} 100rb', 'terima bayaran utang dari {orang} 200rb', '{orang} sudah bayar utangnya',
    'temen balikin 30rb', 'dia balikin 20rb', 'dia udah bayar 50rb', 'teman transfer balik 100rb', 'adik udah balikin uangnya',
  ],
  claim_payment: ['claim dinas cair 300rb', 'klaim bensin cair 120rb', 'reimburse hotel masuk 800rb'],
  balance_statement: ['saldo gopay tinggal 35rb', 'sisa saldo bca 1,5jt', 'saldo mandiri sekarang 4jt', 'uang di dompet tinggal 50rb', 'saldo ovo 120rb sekarang', 'sisa uang cash 200rb'],
};

/** V2.5 kinds → the intents above (for training from the benchmark truths, and for comparing with Engine A). */
export const KIND_TO_INTENT: Record<string, NlpIntent> = {
  expense: 'expense', income: 'income', transfer: 'transfer', debt_new: 'debt_creation', debt_payment: 'debt_payment',
  receivable_new: 'receivable_creation', receivable_payment: 'receivable_payment', claim_new: 'claim_creation', claim_payment: 'claim_payment',
  note_new: 'reminder', plan_new: 'planned_transaction', recurring_new: 'recurring_transaction', balance: 'balance_statement',
};
