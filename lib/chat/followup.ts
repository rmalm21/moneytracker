/**
 * 10.2 Asisten chat 3.5 — what the person says to finish or fix a record, however it is said.
 *
 *   After "Masuk kategori apa?":  "itu masuk makan malam", "buat makan malam", "harusnya makan malam", "kategori:
 *                                 kesehatan", "taro di belanja", "yg makan siang", "parkir motor", "oh itu skincare",
 *                                 "makan malam, pake gopay", "jajan, kemarin", "pemasukan", "bukan keluar, itu uang masuk",
 *                                 "ga tau, terserah", "kategori apa aja yang ada?"
 *   On the card still waiting:    "pakenya gopay", "itu ojek", "namanya kopi kenangan", "dompet sama, tapi kemarin",
 *                                 "ganti jadi makan malam", "kategori salah, harusnya makan malam", "itu hari selasa"
 *   After Simpan (a change card): "masuk ke makan malam", "eh salah harusnya 28rb", "yang barusan pake gopay",
 *                                 "itu kemarin harusnya", "salah kategori, itu makan malam", "yang kopi tadi pake gopay"
 *
 * `readFix` reads such a message into the changes it asks for, or null when it is not (only) that. Category names are
 * resolved against the person's own categories (their names, their words, the concepts behind them), so an answer
 * never makes a new category and an income category on a spending turns it into income. Nothing is saved here: the
 * chat rewrites the card's sentence, or proposes a change card for a saved record, and the person taps Simpan.
 */
import { DATE_PHRASES, amountWords, findAmounts, walletsIn, type QuickContext } from '../quick-entry.ts';
import { resolveCategory, type CatPick, type Flow } from '../category-resolve.ts';
export { resolveCategory, type CatPick, type Flow };

const lower = (s: string) => s.toLocaleLowerCase('id-ID');

export type Fix = {
  category?: CatPick; type?: Flow; wallet?: { id: string; name: string }; date?: string; amount?: { text: string; value: number };
  name?: string; place?: string;
  /** "yang kopi tadi …": the record named, for a saved one. */
  ref?: string;
  /** A category asked for that the person does not have ("kategorinya hewan"). */
  unknownCategory?: string;
  /** "ga tau", "terserah": no category for now. */
  noCategory?: boolean;
  /** "kategori apa aja yang ada?": the choices, again. */
  list?: boolean;
  /** "ubah dompetnya", "ganti tanggalnya": which part, its new value not said yet. */
  askField?: 'wallet' | 'date' | 'category' | 'amount';
  remove?: boolean;
  /** Words that say a fix is meant ("salah", "harusnya", "ganti", "itu"…), not a new record. */
  cue: boolean;
};

const DATE_ANY = new RegExp(DATE_PHRASES.source);
const DAY_ALONE = /^(?:(?:hari\s+)?(?:senin|selasa|rabu|kamis|jumat|jum'at|sabtu|minggu)(?:\s+(?:kemarin|lalu|kemaren))?|kemarin|kemaren|kmrn|kmarin|kemarin lusa|tadi pagi|tadi siang|tadi sore|tadi malam|semalam|semalem|hari ini|barusan|(?:tgl|tanggal)\s*\d{1,2}(?:\s*[/-]\s*\d{1,2})?|\d{1,2}\s*[/-]\s*\d{1,2}|\d+\s+hari\s+(?:lalu|yang lalu|yg lalu))$/;
const isDate = (s: string) => DAY_ALONE.test(s) || (s.match(DATE_ANY)?.[0].trim() === s && !/^(?:nanti|besok|besuk|bsk|lusa)$/.test(s));

// Said at the front or the end of a fix, carrying no content.
const LEAD = /^(?:(?:eh+|oh+|ah|oke|ok|okey|okelah|iya|ya|yaudah|yaudh|yauda|ywdh|yowes|wes|udah|udh|wah|waduh|aduh|hmm+|nah|sip|lho|loh|lah|sori|sorry|maaf|btw|lupa|eh lupa|oiya|oh iya|astaga|duh|tapi|tp|terus|trus|lalu|sama|dan|plus)\b\s*[,.]?\s*)+/;
const TAIL = /(?:\s*[,.]?\s*\b(?:aja|saja|deh|dong|ya|yah|yak|yaa|sih|nih|tuh|kok|lah|deng|dah|kak|min|bro|sis|gan|bos|bang|cuy|guys|juga|kayaknya|kali|harusnya|ya?\s*bro)\b)+\s*[.!?]*$/;
// The record pointed at: "yang tadi", "yg barusan", "yang terakhir", "tadi itu", "itu".
const REF_LEAD = /^(?:(?:yang|yg)\s+)?(?:tadi|barusan|terakhir|td|itu|ini|tsb)\b\s*(?:itu\s+)?/;
// "yang kopi tadi …", "kopi tadi …": a record named by what it was.
const NAMED_REF = /^(?:(?:yang|yg)\s+)?([\p{L}][\p{L} ]{1,28}?)\s+(?:tadi|barusan|td|kemarin|kemaren)\b\s*(?:itu\s+)?/u;
// "harusnya", "seharusnya", "yang bener", "maksudnya" …
const SHOULD = /^(?:harus(?:nya)?|seharus(?:nya)?|mesti(?:nya)?|semestinya|yang bener(?:nya)?|yg bener(?:nya)?|yang benar|benernya|sebenernya|sebenarnya|maksud(?:nya|ku|gue|gw|aku)?|aslinya|ralat|koreksi)\b\s*[,:]?\s*/;
// "salah kategori", "kategorinya salah", "dompetnya salah" …: which part is wrong (the right one follows).
const WRONG = /^(?:(?:salah|keliru)\s+(?:kategori|dompet|nominal|tanggal|harga|jumlah|hari|nama)(?:nya)?|(?:kategori|dompet|nominal|tanggal|harga|jumlah|hari|nama)(?:nya)?\s+(?:salah|keliru))\b\s*[,:]?\s*/;
const CUE_WORDS = /\b(?:bener|benar|benernya|salah|keliru|harus(?:nya)?|seharusnya|mestinya|ganti|ubah|ubahin|gantiin|jadiin|bukan|ralat|koreksi|maksudnya|lupa|tadi|barusan|terakhir|itu|kategori(?:nya)?|dompet(?:nya)?|nominal(?:nya)?|tanggal(?:nya)?|masuk(?:in|kan)?|taro|taruh|pindah(?:in)?|pake(?:nya)?|pakai(?:nya)?|bayar(?:nya)?|eh)\b/;

const TYPE_IN = /^(?:(?:itu|ini|jadi|jadiin|ganti|ubah|ganti jadi|ubah jadi|harusnya|masuk(?:nya)?)\s+)*(?:uang\s+masuk|duit\s+masuk|pemasukan|pemasukkan|pendapatan|penghasilan|income|masuk(?:an)?|nambah|bertambah|dapet|dapat|diterima)(?:\s+(?:bukan\s+(?:keluar|pengeluaran|uang keluar)|ke\s+aku|buat\s+aku))?$/;
const TYPE_OUT = /^(?:(?:itu|ini|jadi|jadiin|ganti|ubah|ganti jadi|ubah jadi|harusnya)\s+)*(?:uang\s+keluar|duit\s+keluar|pengeluaran|expense|keluar(?:an)?|belanja(?:an)?\s+keluar)(?:\s+bukan\s+(?:masuk|pemasukan))?$/;
const NOT_OUT = /^bukan\s+(?:keluar|pengeluaran|uang keluar|expense)\b/;
const NOT_IN = /^bukan\s+(?:masuk|pemasukan|uang masuk|income)\b/;
const NO_CATEGORY = /^(?:(?:ga|gak|nggak|ngga|enggak|tidak|ndak|gk)\s+(?:tau|tahu|ngerti|yakin)|terserah|bebas|apa\s+aja|apa\s+saja|serah|kosongin|kosongkan|biarin|biarkan|tanpa kategori|nggak usah|ga usah|gak usah|gausah|skip|lewatin|lewati|belum tau|blm tau|entah|lainnya|lain lain|lain-lain)\b/;
const LIST = /\b(?:apa\s+(?:aja|saja)|ada\s+apa|pilihan(?:nya)?|daftar(?:nya)?|list(?:nya)?|opsi(?:nya)?|yang\s+(?:ada|tersedia))\b.*\??$|^(?:kategori(?:nya)?\s+)?apa\s+(?:aja|saja)\??$|\b(?:kategori|pilihan)\b.*\b(?:apa|mana)\b.*\?$/;
// The words around a category: "masukin ke kategori …", "taro di …", "buat …", "itu …", "ganti jadi …".
const CAT_WORDS = new Set(['itu', 'ini', 'yang', 'yg', 'buat', 'untuk', 'utk', 'ke', 'di', 'dalam', 'masuk', 'masukin', 'masukkan', 'masukan', 'masuknya', 'taro', 'taruh', 'tarok', 'naro', 'naruh', 'kategori', 'kategorinya', 'kategory', 'ktg', 'kat', 'pos', 'posnya', 'ganti', 'gantiin', 'ubah', 'ubahin', 'jadi', 'jadiin', 'pindah', 'pindahin', 'harusnya', 'seharusnya', 'mestinya', 'aslinya', 'tadi', 'sih', 'oh', 'eh', 'kayaknya', 'kek', 'kayak', 'kaya', 'termasuk', 'ikut', 'jenisnya', 'jenis', 'tipe', 'tipenya', 'golongan', 'kelompok', 'bagian', 'catat', 'catet', 'dicatat', 'sebagai', 'tuh', 'nih']);
/** 10.2 Words that name a field or a slip, never the thing a record is about ("harusnya tanggal kemarin"). */
const FIELD_WORDS = new Set(['tanggal', 'tanggalnya', 'tgl', 'tglnya', 'hari', 'harinya', 'dompet', 'dompetnya', 'nominal', 'nominalnya', 'harga', 'harganya', 'jumlah', 'jumlahnya', 'nama', 'namanya', 'tempat', 'tempatnya', 'lupa', 'salah', 'keliru', 'kasih', 'ngasih']);
const CAT_LEADS = new Set(['masuk', 'masukin', 'masukkan', 'masukan', 'masuknya', 'taro', 'taruh', 'tarok', 'naro', 'naruh', 'kategori', 'kategorinya', 'kategory', 'ktg', 'kat', 'pos', 'posnya', 'ganti', 'ubah', 'jadi', 'pindah', 'pindahin', 'jenisnya', 'termasuk']);
// Around a wallet: "pakenya gopay", "bayarnya pake jago", "dompetnya mandiri", "ke bri", "masuknya ke jago", "eh gopay deh".
const WALLET_WORDS = /\b(?:pake|pakai|pakek|pk|pakenya|pakainya|bayar|bayarnya|dibayar|lewat|via|dari|ke|di|masuk|masuknya|masukin|dompet|dompetnya|rekening|rek|akun|ganti|gantinya|jadi|ubah|pindah|pindahin|itu|yang|yg|tadi|barusan|aja|saja|deh|dong|ya|deng|sih|eh|harusnya|seharusnya|salah|duitnya|uangnya)\b/g;
const AMOUNT_WORDS = /\b(?:ganti|ubah|jadiin|jadi(?:nya)?|bukan|salah|harusnya|seharusnya|koreksi|maksudnya|maksudku|bener(?:nya)?|benar|yang|yg|awal|tadi|barusan|nominal(?:nya)?|harga(?:nya)?|total(?:nya)?|jumlah(?:nya)?|cuma|aslinya|beneran|kayaknya|eh|itu|aja|saja|deh|dong|ya|deng|sih|kok|rp)\b/g;
const REMOVE = /\b(?:hapus|hapusin|apus|apusin|buang|batal|batalin|batalkan|cancel|delete|gajadi|gak jadi|ga jadi|nggak jadi)\b/;
const SAME = /^(?:dompet(?:nya)?|kategori(?:nya)?|tanggal(?:nya)?|nominal(?:nya)?)\s+(?:sama|tetap|tetep|nggak berubah|ga berubah|yang sama|yg sama|kayak tadi|seperti tadi)$|^(?:sama|tetap|tetep)\s+(?:dompet|kategori)(?:nya)?$/;

/** The parts of a message: "makan malam, pake gopay" · "dompet sama, tapi kemarin" · "jajan kemarin". */
function partsOf(t: string) {
  return t.split(/\s*(?:;|,(?!\d)|(?<!\d),)\s*|\s+(?:tapi|tp|terus|trus|lalu|sama|dan)\s+(?=\S)/).map(p => p.trim()).filter(Boolean);
}

/**
 * The changes a message asks for, or null when it is not (only) a fix. `kind`: the record it is for (a category of the
 * other kind turns it). `asking`: the field the assistant just asked for (an answer then needs no cue word).
 */
export function readFix(message: string, ctx: QuickContext, opts: { kind?: Flow; asking?: string; lastWallet?: string } = {}): Fix | null {
  // 10.2 "dua puluh ribu", "goceng": amounts said in words read as numbers.
  let t = amountWords(lower(message).replace(/[“”"']/g, '').replace(/\s+/g, ' ').trim());
  const fix: Fix = { cue: CUE_WORDS.test(t) };
  if (!t) return null;
  const asked = /\?\s*$/.test(t) || /\b(?:berapa|brp|kapan|gimana|gmn|bagaimana|kenapa|knp|mengapa|siapa|dimana|di mana)\b/.test(t);
  if (LIST.test(t) && /\b(?:kategori|pilihan|opsi|daftar|list|apa aja|apa saja)\b/.test(t) && !findAmounts(t).some(a => a.value > 0)) return { list: true, cue: true };
  if (asked) return null;
  t = t.replace(LEAD, '').replace(/[.!?]+$/, '').trim();
  if (!t) return null;
  const kind = opts.kind || 'expense';
  let catNext = false;
  for (let raw of partsOf(t)) {
    let part = raw.replace(LEAD, '').replace(TAIL, '').trim();
    if (!part) continue;
    // A note ("catatannya lembur", "keterangan: rapat divisi") is the card's note, never a category: left to the note reader.
    if (/^(?:tambah(?:in|kan)?\s+|ganti\s+|ubah\s+|kasih\s+|hapus\s+|buang\s+)?(?:catatan(?:nya)?|keterangan(?:nya)?|ket|note|memo)\b/.test(part)) return null;
    // Which record: "yang kopi tadi …" (named) or "yang tadi …".
    part = part.replace(/^(?:tolong\s+)?(?:ubah|ganti|edit|koreksi|ralat|benerin|betulin|ubahin|gantiin|apdet|update)\s+(?=(?:yang|yg)\b|[\p{L}]+\s+(?:tadi|barusan|td)\b)/u, '');
    // Deleting: "hapus yang barusan", "yang terakhir hapus aja", "hapus kopi tadi".
    const rm = part.match(REMOVE);
    if (rm) {
      const rest = part.replace(REMOVE, ' ').replace(/\b(?:yang|yg|barusan|tadi|td|terakhir|itu|ini|aja|saja|deh|dong|ya|catatan(?:nya)?|transaksi(?:nya)?|yang tadi|record)\b/g, ' ').trim();
      if (!rest) { fix.remove = true; fix.cue = true; continue; }
      if (rest.split(' ').length <= 3 && !findAmounts(rest).length) { fix.remove = true; fix.ref = rest; fix.cue = true; continue; }
    }
    const named = part.match(NAMED_REF);
    if (named && !/^(?:yang|yg|itu|ini|tadi|eh|oh|lupa|salah|harusnya|seharusnya|(?:tanggal|tgl|hari|dompet|kategori|nominal|harga|jumlah|nama|tempat)(?:nya)?)$/.test(named[1].trim()) && !isDate(named[0].trim()) && !walletsIn(named[1], ctx.wallets).length) {
      const words = named[1].trim().split(' ');
      // "makan malam tadi pake jago": the thing named; "itu tadi" is not a name.
      if (!words.every(w => CAT_WORDS.has(w) || FIELD_WORDS.has(w))) { fix.ref = named[1].replace(/^(?:yang|yg)\s+/, '').trim(); part = part.slice(named[0].length).trim(); fix.cue = true; }
    }
    for (let i = 0; i < 3; i++) part = part.replace(REF_LEAD, '').replace(WRONG, '').replace(SHOULD, '').replace(LEAD, '').replace(/^salah\b(?!\s+(?:kategori|dompet|nominal|tanggal|harga|jumlah|hari|nama))\s*,?\s*/, '').trim();
    // "… bukan keluar" at the end: the kind it is not.
    const notTail = part.match(/\s+bukan\s+(keluar|pengeluaran|uang keluar|masuk|pemasukan|uang masuk)$/);
    if (notTail) { fix.type = /keluar|pengeluaran/.test(notTail[1]) ? 'income' : 'expense'; fix.cue = true; part = part.slice(0, notTail.index).trim(); if (!part) continue; }
    if (!part) continue;
    if (SAME.test(part)) continue;
    // "lupa kasih kategori, makan malam ya": the next part is the category.
    if (/^(?:lupa\s+)?(?:kasih|ngasih|kasi|isi|ngisi|pasang|masang|pilih|milih|tambahin|nambahin)\s+kategori(?:nya)?$/.test(part)) { catNext = true; fix.cue = true; continue; }
    const which = part.match(/^(?:(?:mau|pengen|pingin|tolong)\s+)?(?:ubah|ganti|ganti in|gantiin|ubahin|edit|benerin|betulin|koreksi|salah)\s+(?:di\s+)?(dompet|wallet|rekening|tanggal|tgl|hari|kategori|nominal|jumlah|harga|total)(?:nya)?(?:\s+(?:dong|deh|ya|juga|dulu|aja|sih))*$|^(dompet|tanggal|kategori|nominal)(?:nya)?\s+(?:salah|keliru)(?:\s+(?:dong|deh|ya|nih|sih))*$/);
    if (which) { const w = which[1] || which[2]; fix.askField = /dompet|wallet|rekening/.test(w) ? 'wallet' : /tanggal|tgl|hari/.test(w) ? 'date' : /kategori/.test(w) ? 'category' : 'amount'; fix.cue = true; continue; }
    if (/^bukan\s+(?:hari ini|kemarin|tadi|itu|ini)$/.test(part)) continue;
    // In or out: "pemasukan", "itu uang masuk", "bukan keluar", "bukan pengeluaran, pemasukan".
    if (NOT_OUT.test(part)) { fix.type = 'income'; fix.cue = true; part = part.replace(NOT_OUT, '').replace(/^\s*,?\s*(?:itu|tapi|tp)?\s*/, '').trim(); if (!part) continue; }
    if (NOT_IN.test(part)) { fix.type = 'expense'; fix.cue = true; part = part.replace(NOT_IN, '').replace(/^\s*,?\s*(?:itu|tapi|tp)?\s*/, '').trim(); if (!part) continue; }
    if (TYPE_IN.test(part)) { fix.type = 'income'; continue; }
    if (TYPE_OUT.test(part)) { fix.type = 'expense'; continue; }
    // "bukan kopi" after the right one: said only to set the wrong one aside.
    part = part.replace(/\s+bukan\s+[\p{L} ]+$/u, '').trim();
    if (/^bukan\s+[\p{L} ]+$/u.test(part)) continue;
    if (opts.asking === 'category' && NO_CATEGORY.test(part)) { fix.noCategory = true; continue; }
    // A day: "kemarin", "tanggal 12", "itu hari selasa", "tanggalnya kemaren".
    const day = part.replace(/^(?:(?:pada|pas|di)\s+)?(?:(?:tanggal(?:nya)?|tgl(?:nya)?|harinya|hari(?=\s+(?:senin|selasa|rabu|kamis|jumat|jum'at|sabtu|minggu))|jadi|ganti|ubah|itu|yang|yg)\s+)*/, '').replace(/\s+(?:deng|dong|kok|ya|harusnya)$/, '').trim();
    if (isDate(day) || /^\d{1,2}$/.test(day) && /\b(?:tanggal|tgl)\b/.test(part)) { fix.date = /^\d{1,2}$/.test(day) ? `tanggal ${day}` : day.replace(/^hari\s+(?=senin|selasa|rabu|kamis|jumat|jum'at|sabtu|minggu)/, ''); continue; }
    // "pake itu aja" right after a wallet was talked about: that one.
    if (opts.lastWallet && /^(?:(?:pake|pakai|pakek|bayar(?:nya)?|dompet(?:nya)?|yang|yg|pakenya)\s+)+(?:itu|yang itu|yg itu|yang tadi|yg tadi|tadi|yang barusan|yg barusan)$/.test(part)) { const w = ctx.wallets.find(x => x.name === opts.lastWallet); if (w) { fix.wallet = { id: w.id, name: w.name }; fix.cue = true; continue; } }
    // A wallet: "pakenya gopay", "bayarnya pake krom", "eh ke mandiri", "dompetnya salah, harusnya jago", "itu cash".
    const w = walletsIn(part, ctx.wallets)[0];
    if (w && !findAmounts(part).some(a => a.value > 0) && !part.replace(w.word, ' ').replace(WALLET_WORDS, ' ').replace(/[\s,.:]+/g, '')) { fix.wallet = { id: w.id, name: w.name }; continue; }
    // An amount: "28rb", "eh salah, 28rb", "nominalnya 3rb", "yg bener 23.500", "jadinya 9rb", "52rb pake jago" (with a wallet).
    const a = findAmounts(part).find(x => x.value > 0);
    if (a) {
      let rest = part.replace(a.text, ' ').replace(AMOUNT_WORDS, ' ');
      const w2 = walletsIn(rest, ctx.wallets)[0];
      if (w2) { rest = rest.replace(w2.word, ' ').replace(WALLET_WORDS, ' '); }
      if (!rest.replace(/[\s,.:]+/g, '')) { fix.amount = { text: a.text.trim(), value: a.value }; if (w2) fix.wallet = { id: w2.id, name: w2.name }; continue; }
      return null;
    }
    // A name or place: "namanya kopi kenangan", "tempatnya fore", "belinya di indomaret".
    const nm = part.match(/^(?:nama(?:nya)?|keterangan(?:nya)?|deskripsi(?:nya)?|judul(?:nya)?)\s+(?:jadi\s+|:\s*)?(.{2,40})$/);
    if (nm) { fix.name = nm[1].trim(); fix.cue = true; continue; }
    const pl = part.match(/^(?:tempat(?:nya)?|toko(?:nya)?|merchant(?:nya)?|warung(?:nya)?|beli(?:nya)?\s+di|belanja(?:nya)?\s+di|lokasi(?:nya)?)\s+(?:di\s+|:\s*)?(.{2,40})$/);
    if (pl) { fix.place = pl[1].trim(); fix.cue = true; continue; }
    // A category: what is left once the words around it are taken away.
    const words = part.split(' ');
    let start = 0; while (start < words.length - 1 && CAT_WORDS.has(words[start])) start++;
    const lead = catNext || words.slice(0, start).some(w => CAT_LEADS.has(w) || w === 'buat' || w === 'untuk' || w === 'utk' || w === 'itu');
    const phrase = words.slice(start).join(' ').replace(/^(?:ke|di)\s+/, '').trim();
    if (!phrase || CAT_WORDS.has(phrase)) continue;
    const c = resolveCategory(phrase, ctx.categories, kind);
    if (c) { fix.category = c; if (lead) fix.cue = true; continue; }
    if (opts.asking === 'category' || words.slice(0, start).some(w => CAT_LEADS.has(w))) { fix.unknownCategory = phrase; continue; }
    return null;
  }
  const any = fix.askField || fix.category || fix.type || fix.wallet || fix.date || fix.amount || fix.name || fix.place || fix.unknownCategory || fix.noCategory || fix.list || fix.remove;
  return any ? fix : null;
}

/** What the fix changes, said back ("kategorinya Makan Malam, pakai GoPay"). */
export function fixSaid(f: Fix, rp: (n: number) => string) {
  return [
    f.type && !f.category ? (f.type === 'income' ? 'jadi pemasukan' : 'jadi pengeluaran') : '',
    f.category ? `${f.type && f.type !== f.category.type ? '' : f.category.type === 'income' && f.type === 'income' ? 'jadi pemasukan, ' : ''}kategorinya ${f.category.name}` : '',
    f.amount ? `nominalnya ${rp(f.amount.value)}` : '', f.wallet ? `pakai ${f.wallet.name}` : '', f.date ? `tanggalnya ${f.date}` : '',
    f.name ? `namanya ${f.name}` : '', f.place ? `tempatnya ${f.place}` : '',
  ].filter(Boolean).join(', ');
}
