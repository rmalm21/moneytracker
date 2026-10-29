/**
 * Chatbot v2 (7.8): generated training sentences, used only at build time (scripts/build-chat-model.mjs; never shipped
 * to the phone). Each intent has patterns with slots ({lead}, {item}, …); every combination is written out, then a
 * fixed-seed sample of each intent is taken, so the corpus is large, varied and the same on every build. All the words
 * were written for this app (no outside data). Held-out test sentences are removed by the build script.
 */
import type { ChatModelIntent } from './feature.ts';

type Grammar = { patterns: string[]; slots: Record<string, string[]>; take: number };

const S = {
  me: ['aku', 'gue', 'saya'], you: ['kamu', 'lo', 'bot', 'asisten'],
  tail: ['', 'dong', 'ya', 'sih', 'deh', 'kak', 'min', 'bro', 'nih', 'please'],
  period: ['bulan ini', 'minggu ini', 'hari ini', 'periode ini', 'bulan lalu', 'minggu lalu', 'kemarin', 'tahun ini', 'sejak gajian'],
  item: ['sepatu', 'hp baru', 'laptop', 'tas', 'baju', 'headset', 'jam tangan', 'skincare', 'tiket konser', 'motor', 'kamera', 'sepeda', 'parfum', 'jaket', 'kopi', 'boba', 'tiket pesawat', 'game', 'tv', 'kulkas'],
  money: ['50rb', '100rb', '150rb', '250rb', '300rb', '500rb', '750rb', '1jt', '1,5jt', '2jt', '3jt', '5jt', '7jt', '10jt', '20rb', '35rb', '80rb'],
  food: ['makan siang', 'kopi', 'bakso', 'nasi padang', 'martabak', 'seblak', 'mie ayam', 'sate', 'ayam geprek', 'es teh', 'gorengan', 'pizza', 'burger', 'sushi', 'bubur'],
  thing: ['bensin', 'parkir', 'pulsa', 'listrik', 'wifi', 'laundry', 'obat', 'ongkir', 'grab', 'gojek', 'token listrik', 'air galon', 'potong rambut', 'tiket bioskop', 'sabun'],
  wallet: ['gopay', 'ovo', 'dana', 'bca', 'jago', 'cash', 'tunai', 'mandiri', 'bri', 'shopeepay'],
  date: ['', 'tadi', 'kemarin', 'tadi pagi', 'tadi siang', 'semalam', 'hari ini'],
  goal: ['liburan', 'nikah', 'rumah', 'motor', 'mobil', 'laptop baru', 'umroh', 'kuliah', 'dana darurat', 'hp baru', 'modal usaha', 'naik haji', 'renovasi rumah', 'konser', 'pendidikan anak'],
};

const G: Partial<Record<ChatModelIntent, Grammar>> = {
  joke: { take: 260, slots: {
    ask: ['kasih', 'ceritain', 'bikinin', 'buatin', 'minta', 'mau', 'pengen', 'ada', 'bagi', 'coba kasih', 'tolong kasih', 'sebutin', 'punya', 'kasih aku', 'boleh minta'],
    joke: ['jokes', 'joke', 'lelucon', 'lawakan', 'candaan', 'humor', 'pantun', 'tebak tebakan', 'tebakan', 'teka teki lucu', 'gombalan', 'cerita lucu', 'dad jokes', 'jokes receh', 'plesetan', 'pantun lucu', 'gombalan receh'],
    end: ['', 'dong', 'dong kak', 'yang lucu', 'yang receh', 'soal duit', 'tentang uang', 'biar ketawa', 'biar semangat', 'yuk', 'please', 'buat aku', 'ga', 'nggak', 'satu aja', 'yang baru', 'soal dompet', 'biar ga bete'],
    tail: S.tail,
  }, patterns: ['{ask} {joke} {end}', '{joke} {end}', '{joke} {tail}', 'bikin {me} ketawa {tail}', 'hibur {me} {tail}', 'gombalin {me} {tail}', '{me} butuh {joke} {tail}', 'lagi pengen ketawa {tail}', 'ada yang lucu ga {tail}', 'ceritain yang lucu lucu {tail}', 'main {joke} yuk', 'bisa ngelawak ga {tail}', '{you} bisa bikin {joke} ga'] },
  banter: { take: 200, slots: {
    laugh: ['wkwk', 'wkwkwk', 'haha', 'hahaha', 'hehe', 'xixixi', 'ngakak', 'lol', 'anjay', 'anjir', 'wkwkwkwk', 'hahahaha'],
    comment: ['receh banget', 'garing', 'jayus', 'lucu juga', 'bisa aja', 'kocak', 'ada ada aja', 'apaan sih', 'receh', 'lumayan', 'kurang lucu', 'ga lucu', 'gak nyambung', 'krik krik', 'parah', 'asli lucu', 'receh parah', 'garing kriuk', 'jayus banget'],
    you: S.you, tail: S.tail,
  }, patterns: ['{laugh}', '{laugh} {comment}', '{comment} {tail}', '{comment} {you}', '{you} ngelawak ya', '{laugh} {you} {comment}', 'jokes {you} {comment}', '{laugh} dasar {you}', '{you} {comment} deh', 'dasar {you} {comment}', '{laugh} {tail}'] },
  angry: { take: 260, slots: {
    insult: ['bego', 'bodoh', 'goblok', 'tolol', 'lemot', 'payah', 'nyebelin', 'ngeselin', 'ga guna', 'gak berguna', 'ngaco', 'oon', 'lelet', 'ngawur', 'menyebalkan', 'ga becus'],
    who: ['kamu', 'lu', 'lo', 'bot', 'asisten ini', 'aplikasi ini', 'botnya', 'dasar bot', 'chatbotnya'],
    feel: ['kesel', 'sebel', 'bete', 'muak', 'benci', 'kesal'], tail: S.tail,
  }, patterns: ['{who} {insult}', '{who} {insult} banget', 'dasar {insult}', '{insult} banget sih {who}', 'kok {who} {insult} sih', 'salah mulu {tail}', 'salah terus sih', '{feel} sama {who}', '{me} {feel} sama {who}', '{feel} banget sama {who}', 'kok ga ngerti ngerti sih', 'jawaban {who} ngaco', 'gimana sih kok salah lagi', 'udah dibilangin masih salah', 'ga paham paham {tail}', 'capek ngomong sama {who}', 'percuma nanya {who}', 'males ah sama {who}', '{who} tuh ga ngerti apa apa', '{who} {insult} parah', 'ih {who} {insult}'], },
  curhat: { take: 320, slots: {
    lead: ['aku lagi', 'gue lagi', 'lagi', 'hari ini aku', 'aku tuh', 'rasanya', 'aku ngerasa', 'jujur aku', 'aduh aku', 'sumpah aku', 'aku', 'gue'],
    feel: ['sedih', 'capek', 'lelah', 'galau', 'stres', 'kecewa', 'kesepian', 'down', 'hancur', 'bad mood', 'overthinking', 'bete', 'nangis terus', 'insecure', 'minder', 'kangen', 'patah hati', 'frustasi', 'cemas', 'tertekan'],
    cause: ['sama kerjaan', 'sama atasan', 'gara gara pacar', 'abis putus', 'sama ortu', 'sama temen', 'karena skripsi', 'karena tugas numpuk', 'sama keluarga', 'gara gara deadline', 'di kantor', 'di kampus', 'karena dimarahin bos', 'soal hubungan', 'karena ditinggal', 'sama mantan', 'karena revisi', 'sama dosen', 'sama sahabat', 'di rumah'],
    open: ['boleh curhat ga', 'mau curhat dong', 'aku pengen cerita', 'dengerin aku dong', 'izin curhat', 'curhat dikit boleh', 'pengen cerita nih', 'mau cerita boleh'],
    event: ['abis berantem sama pacar', 'diputusin', 'pacarku selingkuh', 'dimarahin atasan', 'skripsiku ga kelar', 'ortu ga ngertiin aku', 'temenku ngejauhin aku', 'gebetan ghosting', 'kerjaan ga ada habisnya', 'dosen nolak revisiku', 'ditinggal pas lagi sayang sayangnya', 'berantem sama mama', 'rekan kerja nyebelin', 'ga diajak main sama temen', 'ditolak kerja lagi'],
    tail: S.tail,
  }, patterns: ['{lead} {feel}', '{lead} {feel} {cause}', '{feel} banget {cause}', '{open}', '{event}', '{me} {event}', 'hari ini berat banget {tail}', 'hidupku lagi kacau', '{me} capek sama semuanya', '{me} ngerasa sendirian', 'ga ada yang peduli sama {me}', '{lead} {feel} {tail}', 'baru aja {event}', 'kenapa ya {me} {feel} terus'] },
  serious: { take: 120, slots: {
    core: ['serius dong', 'jangan bercanda', 'jangan becanda', 'udah becandanya', 'udahan bercandanya', 'fokus', 'mode serius', 'tolong serius', 'jawab yang bener', 'stop bercanda', 'ga usah bercanda', 'seriusin', 'yang serius', 'jangan main main', 'serius nih'],
    lead: ['', 'oke', 'udah', 'udah ah', 'sekarang', 'eh', 'please', 'ayo'], tail: ['', 'ya', 'dong', 'deh', 'aku nanya serius', 'ini penting', 'aku lagi serius'],
  }, patterns: ['{lead} {core} {tail}'] },
  teach: { take: 160, slots: {
    w: ['boncos', 'cekidot', 'tongpes', 'kanker', 'mabok', 'gajah', 'kece', 'gercep', 'mantul', 'boker', 'jajan sore', 'cuan', 'bokek parah', 'kering'],
    m: ['boros', 'ringkasan', 'ringkasan bulan ini', 'tips hemat', 'uang habis', 'cek anggaran', 'kantong kering', 'gajian', 'pengeluaran hari ini', 'bokek'],
    say: ['kalau aku bilang', 'kalau gue bilang', 'kalo aku nulis', 'kalau saya ketik', 'inget ya', 'catat ya', 'mulai sekarang', 'tolong inget', 'kalau aku ngomong'],
    means: ['artinya', 'maksudnya', 'berarti', 'sama dengan', 'itu artinya'],
    ask: ['ajari aku', 'ajarin kamu', 'aku mau ngajarin kamu', 'aku ajarin ya', 'boleh aku ajarin', 'mau aku ajarin ga', 'sini aku ajarin', 'aku kasih tau artinya', 'biar aku ajarin', 'aku pengen ngajarin kamu', 'gimana cara ngajarin kamu'],
  }, patterns: ['{say} {w} {means} {m}', '{w} {means} {m}', '{ask}', '{ask} {tail}'] },
  apology: { take: 120, slots: {
    sorry: ['maaf', 'maaf ya', 'maafin aku', 'sori', 'sorry', 'maafkan aku', 'aku minta maaf', 'maaf banget', 'punten', 'iya maaf', 'duh maaf'],
    why: ['', 'tadi aku kasar', 'udah ngatain', 'aku emosi', 'tadi kesel', 'ngegas tadi', 'udah marah marah', 'kelepasan', 'ga maksud kasar', 'tadi ngomong kasar', 'udah nyalahin kamu'], who: ['', 'ya', 'bot', 'kak', 'asisten'],
  }, patterns: ['{sorry} {why}', '{sorry} {who}', '{sorry} {who} {why}'] },
  greet: { take: 120, slots: { hi: ['halo', 'hai', 'hi', 'hello', 'hey', 'pagi', 'siang', 'sore', 'malam', 'selamat pagi', 'selamat siang', 'selamat sore', 'selamat malam', 'met pagi', 'halooo', 'assalamualaikum', 'permisi'], to: ['', 'kak', 'min', 'bot', 'bro', 'asisten', 'dompet ajaib', 'semua', 'kakak'] }, patterns: ['{hi} {to}', '{hi} {hi}', '{hi} {to} apa kabar'] },
  thanks: { take: 120, slots: { th: ['makasih', 'terima kasih', 'thanks', 'thank you', 'makasih banyak', 'trims', 'tengkyu', 'suwun', 'makasih ya', 'thx', 'tq'], to: ['', 'kak', 'bot', 'ya', 'banget', 'bro', 'asisten'], why: ['', 'udah bantu', 'infonya', 'jawabannya', 'udah dengerin', 'bantuannya', 'udah nemenin'] }, patterns: ['{th} {to}', '{th} {why}', 'oke {th}', 'sip {th} {to}', 'mantap {th}'] },
  help: { take: 140, slots: { q: ['bisa apa aja', 'bisa ngapain aja', 'fiturnya apa aja', 'cara pakainya gimana', 'cara pakai', 'gimana cara pakenya', 'apa aja yang bisa', 'bisa bantu apa', 'kemampuanmu apa', 'harus ngetik apa', 'perintahnya apa aja', 'cara nyatet gimana', 'panduannya mana', 'tutorial dong'], who: ['', 'kamu', 'lo', 'bot ini', 'asisten ini', 'aplikasi ini'] }, patterns: ['{who} {q} {tail}', '{q} {tail}'] },
  about: { take: 80, slots: { q: ['siapa', 'apa sebenarnya', 'robot ya', 'ai ya', 'manusia bukan', 'pakai internet ga', 'buatan siapa', 'chatgpt bukan', 'bisa baca dataku ga', 'nyimpen data di mana'], who: ['kamu', 'lo', 'asisten ini', 'bot ini'] }, patterns: ['{who} {q}', '{who} itu {q}', 'sebenernya {who} {q}'] },
  examples: { take: 60, slots: { a: ['contoh', 'template', 'contoh kalimat', 'contoh perintah', 'ide kalimat', 'contoh chat', 'daftar contoh'], b: ['', 'dong', 'apa aja', 'yang bisa dicoba', 'nya mana', 'lagi'] }, patterns: ['{a} {b}', 'liat {a} {b}', 'kasih {a} {b}', 'minta {a} {b}'] },
  smalltalk: { take: 160, slots: { q: ['apa kabar', 'gimana kabarnya', 'lagi apa', 'lagi ngapain', 'udah makan belum', 'sibuk ga', 'tidur ga', 'punya nama ga', 'suka apa', 'umurnya berapa', 'tinggal di mana', 'capek ga'], who: ['', 'kamu', 'lo', 'bot'], bored: ['bosen', 'gabut', 'bete ga ada kerjaan', 'ga ada kerjaan', 'iseng aja'], sleep: ['ngantuk', 'mau tidur dulu', 'selamat tidur', 'good night', 'met bobo', 'bobo dulu ya'] }, patterns: ['{q} {who}', '{who} {q}', '{me} {bored} {tail}', '{bored} {tail}', '{me} {sleep}', '{sleep} {tail}', 'temenin {me} ngobrol {tail}'] },
  mood: { take: 220, slots: { broke: ['bokek', 'kere', 'tongpes', 'tanggal tua', 'dompet tipis', 'lagi seret', 'kanker', 'bangkrut', 'kehabisan uang'], worry: ['pusing', 'stres', 'khawatir', 'panik', 'takut', 'cemas', 'nyesel'], about: ['mikirin uang', 'soal tagihan', 'mikirin cicilan', 'soal utang', 'liat saldo', 'uang ga cukup', 'gaji ga cukup', 'tagihan numpuk', 'abis belanja online', 'kebanyakan checkout', 'uang cepet habis', 'soal keuangan'] }, patterns: ['{me} {broke} {tail}', 'lagi {broke} {tail}', 'aduh {broke}', '{me} {worry} {about}', '{worry} {about} {tail}', 'uangku tinggal dikit', 'duitku abis terus', 'kenapa uangku cepet habis', '{me} kalap belanja', 'saldo {me} tinggal dikit'] },
  summary: { take: 200, slots: { a: ['ringkasan', 'rangkuman', 'rekap', 'laporan', 'kondisi keuangan', 'keadaan dompet', 'status keuangan', 'gambaran keuangan', 'resume keuangan', 'overview keuangan', 'kesehatan keuangan', 'kondisi duit'], lead: ['', 'minta', 'kasih', 'tolong', 'liat', 'cek', 'gimana', 'bikin'], who: ['', 'ku', 'aku', 'gue'] }, patterns: ['{lead} {a} {period} {tail}', '{a} {who} {period}', '{a} {who} gimana', 'gimana {a} {who}', 'aman ga sampai gajian {tail}', 'cukup ga uangku sampai gajian'] },
  budget: { take: 160, slots: { b: ['anggaran', 'budget', 'anggaranku', 'budget gue', 'semua anggaran', 'anggaran semua'], q: ['gimana', 'aman ga', 'cek', 'sisa berapa', 'yang mau habis apa', 'yang jebol apa aja', 'masih aman kan', 'progressnya', 'status', 'yang kelewatan', 'udah kepake berapa'] }, patterns: ['{b} {q} {tail}', '{q} {b} {tail}', 'cek {b} {period}', 'lihat {b} {tail}'] },
  payday: { take: 140, slots: { when: ['kapan', 'berapa hari lagi', 'masih lama ga', 'tinggal berapa hari', 'udah dekat belum', 'masih berapa lama', 'hitung mundur'], pay: ['gajian', 'gaji turun', 'tanggal muda', 'payday', 'gaji masuk', 'gaji cair'] }, patterns: ['{when} {pay} {tail}', '{pay} {when} {tail}', '{pay} kapan {tail}', 'jatah harian sampai {pay}', 'sehari boleh habis berapa sampai {pay}'] },
  afford: { take: 260, slots: { can: ['boleh', 'aman', 'bisa', 'sanggup', 'kuat', 'oke', 'mampu', 'cukup'], no: ['ga', 'nggak', 'gak', '', 'kah'], buy: ['beli', 'jajan', 'checkout', 'nonton', 'ambil', 'langganan', 'bayar'] }, patterns: ['{can} {no} {buy} {item} {money}', '{can} {no} {me} {buy} {item} {money}', 'kalau {buy} {item} {money} {can} {no}', '{me} mau {buy} {item} {money} {can} {no}', '{buy} {item} {money} {can} {no} ya', 'duitku cukup ga buat {item} {money}'] },
  tips: { take: 180, slots: { t: ['tips', 'saran', 'cara', 'trik', 'strategi'], h: ['hemat', 'nabung', 'ngatur uang', 'biar ga boros', 'biar cukup sampai gajian', 'ngirit', 'atur gaji', 'ngurangin jajan', 'disiplin keuangan', 'biar ga kalap', 'nyisihin uang'] }, patterns: ['{t} {h} {tail}', 'kasih {t} {h} {tail}', 'gimana {t} {h}', 'minta {t} {h}', '{me} pengen {h} {tail}', 'gimana caranya {h}'] },
  calc: { take: 200, slots: { op: ['dibagi', 'dikali', 'ditambah', 'dikurangi', 'kali', 'bagi', 'tambah', 'kurang'], sym: ['x', '+', '-', '/', '*'], pct: ['10%', '15%', '20%', '25%', '35%', '50%'] }, patterns: ['hitung {money} {op} {money}', 'berapa {money} {op} 3', 'itungin {money} {op} {money} {tail}', '{money} {sym} 4', 'berapa {pct} dari {money}', '{pct} dari {money} berapa', 'hitungin {pct} dari {money}', 'kalkulator {money} {op} 12', 'hasil {money} {op} 2 berapa'] },
  goal: { take: 200, slots: { want: ['pengen', 'mau', 'pingin', 'ingin', 'target', 'rencana', 'niat'], save: ['nabung', 'ngumpulin uang', 'siapin dana', 'nyisihin uang', 'mulai nabung', 'nyiapin uang'] }, patterns: ['{want} {save} buat {goal} {tail}', '{me} {want} {save} untuk {goal}', '{want} punya {goal} tahun depan', 'gimana caranya {save} buat {goal}', 'mau bikin dana darurat {tail}', 'target {save} {goal}'] },
  record: { take: 260, slots: { verb: ['', 'beli', 'bayar', 'jajan', 'abis'] }, patterns: ['{verb} {food} {money} {date}', '{food} {money} pakai {wallet}', '{verb} {thing} {money} {date}', '{thing} {money} pakai {wallet} {date}', 'gaji {money} masuk {wallet}', 'transfer {money} ke {wallet}', 'terima {money} dari ibu', 'top up {wallet} {money}', 'dapat bonus {money}'] },
  question: { take: 220, slots: { what: ['pengeluaran', 'pemasukan', 'total belanja', 'jajan', 'pengeluaran makan', 'pengeluaran transport', 'belanja online', 'habis buat kopi'], how: ['berapa', 'brp', 'totalnya berapa', 'udah berapa'] }, patterns: ['{what} {period} {how}', '{how} {what} {period}', 'saldo {wallet} berapa', 'kapan terakhir beli {food}', 'berapa kali {food} {period}', 'paling banyak keluar buat apa {period}', 'total {what} {period}'] },
  cancel: { take: 60, slots: { c: ['batal', 'ga jadi', 'gak jadi', 'nggak jadi', 'cancel', 'ga usah', 'skip', 'jangan dicatat', 'batalin', 'ga usah dicatat'], e: ['', 'deh', 'aja', 'dulu', 'ya'] }, patterns: ['{c} {e}'] },
  undo: { take: 60, slots: { d: ['hapus', 'batalin', 'cancel', 'undo', 'tarik'], w: ['yang tadi', 'yang barusan', 'catatan terakhir', 'transaksi terakhir', 'yang terakhir'] }, patterns: ['{d} {w} {tail}', '{w} {d} aja'] },
  style: { take: 80, slots: { s: ['pakai bahasa formal', 'ngomong santai aja', 'jawab singkat aja', 'pakai lo gue', 'bahasa baku dong', 'gaya bahasa gaul', 'jangan kaku', 'pakai bahasa sopan', 'jawab pendek', 'ganti gaya bahasa'] }, patterns: ['{s} {tail}', 'bisa {s} ga'] },
};

/** Every combination of a pattern's slots (written out in order). */
function expand(pattern: string, slots: Record<string, string[]>): string[] {
  const names = [...pattern.matchAll(/\{(\w+)\}/g)].map(m => m[1]);
  let out = [pattern];
  for (const n of [...new Set(names)]) {
    const values = slots[n] || (S as Record<string, string[]>)[n] || [''];
    out = out.flatMap(p => values.map(v => p.split(`{${n}}`).join(v)));
    if (out.length > 20000) out = out.slice(0, 20000);
  }
  return out.map(s => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
}
/** mulberry32: the same sample on every build. */
function random(seed: number) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

/** The generated sentences of every intent. */
export function generatedCorpus(): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  let seed = 7;
  for (const [intent, g] of Object.entries(G)) {
    const all = [...new Set(g!.patterns.flatMap(p => expand(p, g!.slots)))];
    const rnd = random(seed++);
    for (let i = all.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [all[i], all[j]] = [all[j], all[i]]; }
    out[intent] = all.slice(0, g!.take);
  }
  return out;
}
