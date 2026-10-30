/**
 * Hiding amounts on screen (the eye button in the top bar): "Rp12.000", "-Rp1,3 jt" and "±Rp33 rb" all
 * become "Rp•••••". The sign stays; the digits and the size word (rb, jt, M, T) are hidden, so the
 * length gives nothing away. Other numbers (dates, percentages, counts) are left alone.
 */
const MONEY = /Rp\s?\d(?:[\d.,]*\d)?(?:\s?(?:rb|jt|M|T)\b)?/g;
const HAS_MONEY = /Rp\s?\d/;
export const MASKED_AMOUNT = 'Rp•••••';
export const hasAmount = (text: string) => HAS_MONEY.test(text);
export const maskAmounts = (text: string) => text.replace(MONEY, MASKED_AMOUNT);


/**
 * "Angka penting saja" (8.3): only amounts about how much money you have, earn, keep or owe are hidden, and everyday
 * spending stays readable. An amount counts when the nearest money word before it is one of those ("Uang bebas
 * Rp7,2 jt", "Pemasukan Rp9 jt", "Sisa utang Rp6 jt"), not a spending word ("Pengeluaran Rp7 jt", "Makan Rp45.000").
 * `label` is the text shown before it in the same card, for an amount that sits in its own element.
 */
const MONEY_WORDS = /(?<![\p{L}])(?:(saldo|uang\s+bebas|bisa\s+dipakai|aset|kekayaan|net\s?worth|pemasukan|penghasilan|pendapatan|gaji|bonus|thr|masuk|terkumpul|tabungan|ditabung|nabung|disimpan|simpanan|dana|utang|hutang|piutang|pinjaman|dipinjam|belum\s+kembali|sudah\s+kembali|cicilan|investasi|deposito|tersedia|(?:jelang|saat|sebelum)\s+gajian)|(pengeluaran|keluar|belanja(?:an)?|anggaran|budget|terpakai|batas|tagihan|harga|biaya|ongkos|boros|jajan|rata-rata))(?:mu|ku|nya)?(?![\p{L}])/giu;
const ANY_MONEY_WORD = new RegExp(MONEY_WORDS.source, 'iu');
export const hasMoneyWord = (text: string) => ANY_MONEY_WORD.test(text.toLocaleLowerCase('id-ID'));
/** The first money word of a text ("Total saldo di 5 dompet…" → "saldo"): what an answer card is about. */
export const firstMoneyWord = (text: string) => text.toLocaleLowerCase('id-ID').match(ANY_MONEY_WORD)?.[0] || '';
function important(head: string, label: string) {
  // The sentence the amount is in; an amount at the start of its text reads the card's label too.
  const sentence = head.split(/[.!?](?=\s)|\n/).pop() || '';
  const context = (sentence.length === head.length ? `${label} ` : '') + sentence;
  let last: RegExpMatchArray | undefined;
  for (const match of context.toLocaleLowerCase('id-ID').matchAll(MONEY_WORDS)) last = match;
  return !!last?.[1];
}
export const maskImportantAmounts = (text: string, label = '') => text.replace(MONEY, (amount, at: number) => important(text.slice(0, at), label) ? MASKED_AMOUNT : amount);
