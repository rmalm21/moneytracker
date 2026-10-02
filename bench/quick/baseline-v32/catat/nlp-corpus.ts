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

/** V2.5 kinds → the intents above (for training from the benchmark truths, and for comparing with Engine A). */
export const KIND_TO_INTENT: Record<string, NlpIntent> = {
  expense: 'expense', income: 'income', transfer: 'transfer', debt_new: 'debt_creation', debt_payment: 'debt_payment',
  receivable_new: 'receivable_creation', receivable_payment: 'receivable_payment', claim_new: 'claim_creation', claim_payment: 'claim_payment',
  note_new: 'reminder', plan_new: 'planned_transaction', recurring_new: 'recurring_transaction', balance: 'balance_statement',
};
