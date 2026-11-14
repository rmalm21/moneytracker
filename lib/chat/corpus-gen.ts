/**
 * Chatbot v2 (7.8): generated training sentences, used only at build time (scripts/build-chat-model.mjs; never shipped
 * to the phone). Each intent has patterns with slots ({lead}, {item}, …); every combination is written out, then a
 * fixed-seed sample of each intent is taken, so the corpus is large, varied and the same on every build. All the words
 * were written for this app (no outside data). Held-out test sentences are removed by the build script. 10.2: the
 * sample takes from every pattern in turn.
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

const G: Partial<Record<ChatModelIntent | 'None', Grammar>> = {
  // 10.2 A name or a name with a little word: an answer to a question asked before ("sama andi"), never an intent alone.
  None: { take: 200, slots: { name: ['andi', 'budi', 'rina', 'sari', 'dewi', 'tono', 'bayu', 'rudi', 'agus', 'siti', 'putri', 'rizky', 'dimas', 'fajar', 'nina', 'tika', 'yuni', 'joko', 'eko', 'wati', 'mama', 'papa', 'ibu', 'bapak', 'kakak', 'adik', 'pak rt', 'bu ani', 'mas agus', 'mbak sri'], w: ['sama', 'ke', 'buat', 'dari', 'punya', 'yang', 'untuk', 'bareng', 'si', 'dia'] }, patterns: ['{w} {name}', '{name}', '{name} aja', '{w} {name} aja', '{w} {name} ya'] },
  joke: { take: 500, slots: {
    ask: ['kasih', 'ceritain', 'bikinin', 'buatin', 'minta', 'mau', 'pengen', 'ada', 'bagi', 'coba kasih', 'tolong kasih', 'sebutin', 'punya', 'kasih aku', 'boleh minta'],
    joke: ['jokes', 'joke', 'lelucon', 'lawakan', 'candaan', 'humor', 'pantun', 'tebak tebakan', 'tebakan', 'teka teki lucu', 'gombalan', 'cerita lucu', 'dad jokes', 'jokes receh', 'plesetan', 'pantun lucu', 'gombalan receh'],
    end: ['', 'dong', 'dong kak', 'yang lucu', 'yang receh', 'soal duit', 'tentang uang', 'biar ketawa', 'biar semangat', 'yuk', 'please', 'buat aku', 'ga', 'nggak', 'satu aja', 'yang baru', 'soal dompet', 'biar ga bete'],
    tail: S.tail,
  }, patterns: ['{ask} {joke} {end}', '{joke} {end}', '{joke} {tail}', 'bikin {me} ketawa {tail}', 'hibur {me} {tail}', 'gombalin {me} {tail}', '{me} butuh {joke} {tail}', 'lagi pengen ketawa {tail}', 'ada yang lucu ga {tail}', 'ceritain yang lucu lucu {tail}', 'main {joke} yuk', 'bisa ngelawak ga {tail}', '{you} bisa bikin {joke} ga'] },
  banter: { take: 400, slots: {
    laugh: ['wkwk', 'wkwkwk', 'haha', 'hahaha', 'hehe', 'xixixi', 'ngakak', 'lol', 'anjay', 'anjir', 'wkwkwkwk', 'hahahaha'],
    comment: ['receh banget', 'garing', 'jayus', 'lucu juga', 'bisa aja', 'kocak', 'ada ada aja', 'apaan sih', 'receh', 'lumayan', 'kurang lucu', 'ga lucu', 'gak nyambung', 'krik krik', 'parah', 'asli lucu', 'receh parah', 'garing kriuk', 'jayus banget'],
    you: S.you, tail: S.tail,
  }, patterns: ['{laugh}', '{laugh} {comment}', '{comment} {tail}', '{comment} {you}', '{you} ngelawak ya', '{laugh} {you} {comment}', 'jokes {you} {comment}', '{laugh} dasar {you}', '{you} {comment} deh', 'dasar {you} {comment}', '{laugh} {tail}'] },
  angry: { take: 480, slots: {
    insult: ['bego', 'bodoh', 'goblok', 'tolol', 'lemot', 'payah', 'nyebelin', 'ngeselin', 'ga guna', 'gak berguna', 'ngaco', 'oon', 'lelet', 'ngawur', 'menyebalkan', 'ga becus'],
    who: ['kamu', 'lu', 'lo', 'bot', 'asisten ini', 'aplikasi ini', 'botnya', 'dasar bot', 'chatbotnya'],
    feel: ['kesel', 'sebel', 'bete', 'muak', 'benci', 'kesal'], tail: S.tail,
  }, patterns: ['{who} {insult}', '{who} {insult} banget', 'dasar {insult}', '{insult} banget sih {who}', 'kok {who} {insult} sih', 'salah mulu {tail}', 'salah terus sih', '{feel} sama {who}', '{me} {feel} sama {who}', '{feel} banget sama {who}', 'kok ga ngerti ngerti sih', 'jawaban {who} ngaco', 'gimana sih kok salah lagi', 'udah dibilangin masih salah', 'ga paham paham {tail}', 'capek ngomong sama {who}', 'percuma nanya {who}', 'males ah sama {who}', '{who} tuh ga ngerti apa apa', '{who} {insult} parah', 'ih {who} {insult}'], },
  curhat: { take: 600, slots: {
    lead: ['aku lagi', 'gue lagi', 'lagi', 'hari ini aku', 'aku tuh', 'rasanya', 'aku ngerasa', 'jujur aku', 'aduh aku', 'sumpah aku', 'aku', 'gue'],
    feel: ['sedih', 'capek', 'lelah', 'galau', 'stres', 'kecewa', 'kesepian', 'down', 'hancur', 'bad mood', 'overthinking', 'bete', 'nangis terus', 'insecure', 'minder', 'kangen', 'patah hati', 'frustasi', 'cemas', 'tertekan'],
    cause: ['sama kerjaan', 'sama atasan', 'gara gara pacar', 'abis putus', 'sama ortu', 'sama temen', 'karena skripsi', 'karena tugas numpuk', 'sama keluarga', 'gara gara deadline', 'di kantor', 'di kampus', 'karena dimarahin bos', 'soal hubungan', 'karena ditinggal', 'sama mantan', 'karena revisi', 'sama dosen', 'sama sahabat', 'di rumah'],
    open: ['boleh curhat ga', 'mau curhat dong', 'aku pengen cerita', 'dengerin aku dong', 'izin curhat', 'curhat dikit boleh', 'pengen cerita nih', 'mau cerita boleh'],
    event: ['abis berantem sama pacar', 'diputusin', 'pacarku selingkuh', 'dimarahin atasan', 'skripsiku ga kelar', 'ortu ga ngertiin aku', 'temenku ngejauhin aku', 'gebetan ghosting', 'kerjaan ga ada habisnya', 'dosen nolak revisiku', 'ditinggal pas lagi sayang sayangnya', 'berantem sama mama', 'rekan kerja nyebelin', 'ga diajak main sama temen', 'ditolak kerja lagi'],
    tail: S.tail,
  }, patterns: ['{lead} {feel}', '{lead} {feel} {cause}', '{feel} banget {cause}', '{open}', '{event}', '{me} {event}', 'hari ini berat banget {tail}', 'hidupku lagi kacau', '{me} capek sama semuanya', '{me} ngerasa sendirian', 'ga ada yang peduli sama {me}', '{lead} {feel} {tail}', 'baru aja {event}', 'kenapa ya {me} {feel} terus'] },
  serious: { take: 240, slots: {
    core: ['serius dong', 'jangan bercanda', 'jangan becanda', 'udah becandanya', 'udahan bercandanya', 'fokus', 'mode serius', 'tolong serius', 'jawab yang bener', 'stop bercanda', 'ga usah bercanda', 'seriusin', 'yang serius', 'jangan main main', 'serius nih'],
    lead: ['', 'oke', 'udah', 'udah ah', 'sekarang', 'eh', 'please', 'ayo'], tail: ['', 'ya', 'dong', 'deh', 'aku nanya serius', 'ini penting', 'aku lagi serius'],
  }, patterns: ['{lead} {core} {tail}'] },
  teach: { take: 300, slots: {
    w: ['boncos', 'cekidot', 'tongpes', 'kanker', 'mabok', 'gajah', 'kece', 'gercep', 'mantul', 'boker', 'jajan sore', 'cuan', 'bokek parah', 'kering'],
    m: ['boros', 'ringkasan', 'ringkasan bulan ini', 'tips hemat', 'uang habis', 'cek anggaran', 'kantong kering', 'gajian', 'pengeluaran hari ini', 'bokek'],
    say: ['kalau aku bilang', 'kalau gue bilang', 'kalo aku nulis', 'kalau saya ketik', 'inget ya', 'catat ya', 'mulai sekarang', 'tolong inget', 'kalau aku ngomong'],
    means: ['artinya', 'maksudnya', 'berarti', 'sama dengan', 'itu artinya'],
    ask: ['ajari aku', 'ajarin kamu', 'aku mau ngajarin kamu', 'aku ajarin ya', 'boleh aku ajarin', 'mau aku ajarin ga', 'sini aku ajarin', 'aku kasih tau artinya', 'biar aku ajarin', 'aku pengen ngajarin kamu', 'gimana cara ngajarin kamu'],
  }, patterns: ['{say} {w} {means} {m}', '{w} {means} {m}', '{ask}', '{ask} {tail}'] },
  apology: { take: 240, slots: {
    sorry: ['maaf', 'maaf ya', 'maafin aku', 'sori', 'sorry', 'maafkan aku', 'aku minta maaf', 'maaf banget', 'punten', 'iya maaf', 'duh maaf'],
    why: ['', 'tadi aku kasar', 'udah ngatain', 'aku emosi', 'tadi kesel', 'ngegas tadi', 'udah marah marah', 'kelepasan', 'ga maksud kasar', 'tadi ngomong kasar', 'udah nyalahin kamu'], who: ['', 'ya', 'bot', 'kak', 'asisten'],
  }, patterns: ['{sorry} {why}', '{sorry} {who}', '{sorry} {who} {why}'] },
  greet: { take: 240, slots: { hi: ['halo', 'hai', 'hi', 'hello', 'hey', 'pagi', 'siang', 'sore', 'malam', 'selamat pagi', 'selamat siang', 'selamat sore', 'selamat malam', 'met pagi', 'halooo', 'assalamualaikum', 'permisi'], to: ['', 'kak', 'min', 'bot', 'bro', 'asisten', 'dompet ajaib', 'semua', 'kakak'] }, patterns: ['{hi} {to}', '{hi} {hi}', '{hi} {to} apa kabar'] },
  thanks: { take: 220, slots: { th: ['makasih', 'terima kasih', 'thanks', 'thank you', 'makasih banyak', 'trims', 'tengkyu', 'suwun', 'makasih ya', 'thx', 'tq'], to: ['', 'kak', 'bot', 'ya', 'banget', 'bro', 'asisten'], why: ['', 'udah bantu', 'infonya', 'jawabannya', 'udah dengerin', 'bantuannya', 'udah nemenin'] }, patterns: ['{th} {to}', '{th} {why}', 'oke {th}', 'sip {th} {to}', 'mantap {th}'] },
  help: { take: 300, slots: { q: ['bisa apa aja', 'bisa ngapain aja', 'fiturnya apa aja', 'cara pakainya gimana', 'cara pakai', 'gimana cara pakenya', 'apa aja yang bisa', 'bisa bantu apa', 'kemampuanmu apa', 'harus ngetik apa', 'perintahnya apa aja', 'cara nyatet gimana', 'panduannya mana', 'tutorial dong'], who: ['', 'kamu', 'lo', 'bot ini', 'asisten ini', 'aplikasi ini'] }, patterns: ['{who} {q} {tail}', '{q} {tail}'] },
  about: { take: 360, slots: { q: ['siapa', 'apa sebenarnya', 'robot ya', 'ai ya', 'manusia bukan', 'pakai internet ga', 'buatan siapa', 'chatgpt bukan', 'bisa baca dataku ga', 'nyimpen data di mana', 'butuh internet ga', 'jalan offline ga', 'pakai ai apa', 'belajar dari mana', 'bisa salah ga', 'ngirim data ke luar ga', 'gemini bukan', 'pinter ga', 'online ga', 'nyimpen chat ga'], who: ['kamu', 'lo', 'asisten ini', 'bot ini', 'chat ini', 'aplikasi ini'], what: ['ai', 'robot', 'bot', 'manusia', 'mesin', 'chatgpt', 'gemini', 'program', 'orang beneran', 'admin'], tag: ['', 'kah', 'beneran', 'ya', 'bukan', 'atau manusia', 'apa bukan', 'sih', 'asli'], data: ['data aku', 'datanya', 'data keuanganku', 'catatanku', 'transaksiku', 'obrolan ini', 'riwayat chat', 'isi chat', 'saldo aku'], where: ['disimpan di mana', 'dikirim ke mana', 'aman ga', 'dibaca orang ga', 'masuk server ga', 'diupload ga', 'dijual ga', 'dipakai buat apa', 'bisa diliat orang lain ga', 'keluar dari hp ga', 'disimpan di cloud ga', 'dikirim ke internet ga'] }, patterns: ['{who} {q}', '{who} itu {q}', 'sebenernya {who} {q}', '{data} {where}', '{where} {data}', 'kalau chat sama {who} {data} {where}', '{who} {what} {tag}', 'apa {who} {what}', '{who} itu {what} {tag}'] },
  examples: { take: 120, slots: { a: ['contoh', 'template', 'contoh kalimat', 'contoh perintah', 'ide kalimat', 'contoh chat', 'daftar contoh'], b: ['', 'dong', 'apa aja', 'yang bisa dicoba', 'nya mana', 'lagi'] }, patterns: ['{a} {b}', 'liat {a} {b}', 'kasih {a} {b}', 'minta {a} {b}'] },
  smalltalk: { take: 320, slots: { q: ['apa kabar', 'gimana kabarnya', 'lagi apa', 'lagi ngapain', 'udah makan belum', 'sibuk ga', 'tidur ga', 'punya nama ga', 'suka apa', 'umurnya berapa', 'tinggal di mana', 'capek ga'], who: ['', 'kamu', 'lo', 'bot'], bored: ['bosen', 'gabut', 'bete ga ada kerjaan', 'ga ada kerjaan', 'iseng aja'], sleep: ['ngantuk', 'mau tidur dulu', 'selamat tidur', 'good night', 'met bobo', 'bobo dulu ya'] }, patterns: ['{q} {who}', '{who} {q}', '{me} {bored} {tail}', '{bored} {tail}', '{me} {sleep}', '{sleep} {tail}', 'temenin {me} ngobrol {tail}'] },
  mood: { take: 440, slots: { broke: ['bokek', 'kere', 'tongpes', 'tanggal tua', 'dompet tipis', 'lagi seret', 'kanker', 'bangkrut', 'kehabisan uang'], worry: ['pusing', 'stres', 'khawatir', 'panik', 'takut', 'cemas', 'nyesel'], about: ['mikirin uang', 'soal tagihan', 'mikirin cicilan', 'soal utang', 'liat saldo', 'uang ga cukup', 'gaji ga cukup', 'tagihan numpuk', 'abis belanja online', 'kebanyakan checkout', 'uang cepet habis', 'soal keuangan'] }, patterns: ['{me} {broke} {tail}', 'lagi {broke} {tail}', 'aduh {broke}', '{me} {worry} {about}', '{worry} {about} {tail}', 'uangku tinggal dikit', 'duitku abis terus', 'kenapa uangku cepet habis', '{me} kalap belanja', 'saldo {me} tinggal dikit'] },
  summary: { take: 400, slots: { verb: ['rangkum', 'rangkumin', 'ringkas', 'ringkasin', 'rekap', 'rekapin', 'simpulin', 'jabarin', 'kasih gambaran'], obj: ['pengeluaranku', 'keuanganku', 'uang keluar masuk', 'transaksiku', 'pemasukan pengeluaran', 'duitku', 'kondisi dompetku', 'cash flow aku'], a: ['ringkasan', 'rangkuman', 'rekap', 'laporan', 'kondisi keuangan', 'keadaan dompet', 'status keuangan', 'gambaran keuangan', 'resume keuangan', 'overview keuangan', 'kesehatan keuangan', 'kondisi duit'], lead: ['', 'minta', 'kasih', 'tolong', 'liat', 'cek', 'gimana', 'bikin'], who: ['', 'ku', 'aku', 'gue'] }, patterns: ['{lead} {a} {period} {tail}', '{a} {who} {period}', '{a} {who} gimana', 'gimana {a} {who}', 'aman ga sampai gajian {tail}', 'cukup ga uangku sampai gajian', '{verb} {obj} {period} {tail}', 'tolong {verb} {obj} {period}', '{verb} dong {obj} {period}'] },
  budget: { take: 320, slots: { b: ['anggaran', 'budget', 'anggaranku', 'budget gue', 'semua anggaran', 'anggaran semua'], q: ['gimana', 'aman ga', 'cek', 'sisa berapa', 'yang mau habis apa', 'yang jebol apa aja', 'masih aman kan', 'progressnya', 'status', 'yang kelewatan', 'udah kepake berapa'] }, patterns: ['{b} {q} {tail}', '{q} {b} {tail}', 'cek {b} {period}', 'lihat {b} {tail}'] },
  payday: { take: 280, slots: { when: ['kapan', 'berapa hari lagi', 'masih lama ga', 'tinggal berapa hari', 'udah dekat belum', 'masih berapa lama', 'hitung mundur'], pay: ['gajian', 'gaji turun', 'tanggal muda', 'payday', 'gaji masuk', 'gaji cair'] }, patterns: ['{when} {pay} {tail}', '{pay} {when} {tail}', '{pay} kapan {tail}', 'jatah harian sampai {pay}', 'sehari boleh habis berapa sampai {pay}'] },
  afford: { take: 500, slots: { can: ['boleh', 'aman', 'bisa', 'sanggup', 'kuat', 'oke', 'mampu', 'cukup'], no: ['ga', 'nggak', 'gak', '', 'kah'], buy: ['beli', 'jajan', 'checkout', 'nonton', 'ambil', 'langganan', 'bayar'] }, patterns: ['{can} {no} {buy} {item} {money}', '{can} {no} {me} {buy} {item} {money}', 'kalau {buy} {item} {money} {can} {no}', '{me} mau {buy} {item} {money} {can} {no}', '{buy} {item} {money} {can} {no} ya', 'duitku cukup ga buat {item} {money}'] },
  tips: { take: 360, slots: { t: ['tips', 'saran', 'cara', 'trik', 'strategi'], h: ['hemat', 'nabung', 'ngatur uang', 'biar ga boros', 'biar cukup sampai gajian', 'ngirit', 'atur gaji', 'ngurangin jajan', 'disiplin keuangan', 'biar ga kalap', 'nyisihin uang'] }, patterns: ['{t} {h} {tail}', 'kasih {t} {h} {tail}', 'gimana {t} {h}', 'minta {t} {h}', '{me} pengen {h} {tail}', 'gimana caranya {h}'] },
  calc: { take: 360, slots: { op: ['dibagi', 'dikali', 'ditambah', 'dikurangi', 'kali', 'bagi', 'tambah', 'kurang'], sym: ['x', '+', '-', '/', '*'], pct: ['10%', '15%', '20%', '25%', '35%', '50%'] }, patterns: ['hitung {money} {op} {money}', 'berapa {money} {op} 3', 'itungin {money} {op} {money} {tail}', '{money} {sym} 4', 'berapa {pct} dari {money}', '{pct} dari {money} berapa', 'hitungin {pct} dari {money}', 'kalkulator {money} {op} 12', 'hasil {money} {op} 2 berapa'] },
  goal: { take: 400, slots: { want: ['pengen', 'mau', 'pingin', 'ingin', 'target', 'rencana', 'niat'], save: ['nabung', 'ngumpulin uang', 'siapin dana', 'nyisihin uang', 'mulai nabung', 'nyiapin uang'] }, patterns: ['{want} {save} buat {goal} {tail}', '{me} {want} {save} untuk {goal}', '{want} punya {goal} tahun depan', 'gimana caranya {save} buat {goal}', 'mau bikin dana darurat {tail}', 'target {save} {goal}'] },
  record: { take: 500, slots: { verb: ['', 'beli', 'bayar', 'jajan', 'abis'] }, patterns: ['{verb} {food} {money} {date}', '{food} {money} pakai {wallet}', '{verb} {thing} {money} {date}', '{thing} {money} pakai {wallet} {date}', 'gaji {money} masuk {wallet}', 'transfer {money} ke {wallet}', 'terima {money} dari ibu', 'top up {wallet} {money}', 'dapat bonus {money}'] },
  question: { take: 440, slots: { what: ['pengeluaran', 'pemasukan', 'total belanja', 'jajan', 'pengeluaran makan', 'pengeluaran transport', 'belanja online', 'habis buat kopi'], how: ['berapa', 'brp', 'totalnya berapa', 'udah berapa'] }, patterns: ['{what} {period} {how}', '{how} {what} {period}', 'saldo {wallet} berapa', 'kapan terakhir beli {food}', 'berapa kali {food} {period}', 'paling banyak keluar buat apa {period}', 'total {what} {period}'] },
  cancel: { take: 50, slots: { c: ['batal', 'ga jadi', 'gak jadi', 'nggak jadi', 'cancel', 'ga usah', 'skip', 'jangan dicatat', 'batalin', 'ga usah dicatat'], e: ['', 'deh', 'aja', 'dulu', 'ya'] }, patterns: ['{c} {e}'] },
  undo: { take: 120, slots: { d: ['hapus', 'batalin', 'cancel', 'undo', 'tarik'], w: ['yang tadi', 'yang barusan', 'catatan terakhir', 'transaksi terakhir', 'yang terakhir'] }, patterns: ['{d} {w} {tail}', '{w} {d} aja'] },
  // 10.2 Asisten 3.5 (see corpus.ts): fixes, "what about …?", how to use a feature, asking to play.
  fix: { take: 800, slots: {
    lead: ['', 'eh', 'eh salah', 'bukan', 'bukan bukan', 'ralat', 'maaf', 'oh iya', 'eh bentar', 'tunggu', 'eh iya', 'wait', 'loh', 'lho', 'aduh', 'oops', 'sori'],
    cat: ['makan malam', 'makan siang', 'sarapan', 'makan', 'jajan', 'kopi', 'transportasi', 'transport', 'ojek', 'bensin', 'parkir', 'belanja', 'belanja bulanan', 'hiburan', 'nongkrong', 'tagihan', 'listrik', 'pulsa', 'kesehatan', 'pendidikan', 'sedekah', 'donasi', 'hadiah', 'kado', 'langganan', 'olahraga', 'fashion', 'skincare', 'rumah tangga', 'gaji', 'bonus', 'penjualan', 'freelance', 'dinner', 'lunch', 'breakfast', 'groceries'],
    catlead: ['kategorinya', 'masuk ke', 'masuk', 'masukin ke', 'masukin', 'itu buat', 'itu', 'harusnya', 'pos', 'masuk pos', 'kategori', 'taruh di', 'pindahin ke', 'jadiin', 'itu termasuk', 'ganti jadi', 'ubah jadi', 'ganti kategorinya jadi', 'itu kategori', 'kategorinya harusnya'],
    wlead: ['pake', 'pakai', 'bayarnya pake', 'harusnya pake', 'dari', 'lewat', 'via', 'dompetnya', 'pakenya', 'bukan cash tapi', 'ganti ke', 'pindah ke', 'dompetnya harusnya', 'keluarnya dari'],
    dlead: ['itu', 'harusnya', 'tanggalnya', 'itu tanggal', 'kejadiannya', 'belinya', 'bukan hari ini tapi', 'tanggalnya harusnya'],
    dval: ['kemarin', 'kemarin lusa', 'tadi pagi', 'hari senin', 'hari selasa', 'hari rabu', 'hari kamis', 'hari jumat', 'hari sabtu', 'hari minggu', 'minggu lalu', 'tanggal 3', 'tanggal 12', 'tgl 20', 'semalam', 'senin', 'jumat'],
    field: ['kategorinya', 'dompetnya', 'nominalnya', 'tanggalnya', 'namanya', 'tempatnya', 'jenisnya', 'jumlahnya', 'harganya'],
    wrong: ['salah', 'keliru', 'ga bener', 'kurang tepat', 'ketuker', 'kebalik', 'salah tuh', 'salah deh', 'ngaco'],
    change: ['ganti', 'ubah', 'benerin', 'edit', 'ralat', 'koreksi', 'revisi', 'betulin', 'perbaiki', 'update'],
    what: ['yang tadi', 'yang barusan', 'yang terakhir', 'catatan tadi', 'transaksi tadi', 'kartunya', 'itu'],
    typ: ['itu pemasukan', 'itu uang masuk', 'bukan pengeluaran', 'bukan keluar itu masuk', 'harusnya pemasukan', 'harusnya pengeluaran', 'itu pengeluaran', 'bukan pemasukan', 'kebalik harusnya masuk', 'itu income', 'itu duit masuk', 'itu bukan jajan tapi gaji', 'itu uang keluar'],
    fw: ['kategori', 'dompet', 'nominal', 'tanggal', 'catat', 'input', 'ketik', 'pilih kategori', 'pilih dompet'],
    tail: ['', 'dong', 'ya', 'deh', 'aja', 'deng', 'kak', 'min'],
  }, patterns: ['{lead} {catlead} {cat} {tail}', 'kategorinya {cat} {tail}', '{lead} kategorinya {cat}', 'kategori {cat} {tail}', 'masuk {cat} {tail}', 'masuk ke {cat} {tail}', 'itu {cat} {tail}', 'itu buat {cat}', '{lead} {wlead} {wallet} {tail}', '{lead} {dlead} {dval} {tail}', '{field} {wrong} {tail}', '{lead} {field} {wrong}', '{change} {field} {tail}', '{change} {field} {what}', '{field} {what} {wrong}', '{lead} {typ} {tail}', '{what} {wrong} {tail}', '{lead} {what} {wrong}', 'salah {fw} {tail}', '{lead} {change} {what} {tail}'] },
  followup: { take: 360, slots: {
    lead: ['', 'eh', 'terus', 'trus', 'nah', 'oke', 'lalu', 'min', 'bot', 'kak', 'oh', 'hmm'],
    kal: ['kalau', 'kalo', 'klo', 'gimana kalau', 'kalau yang', 'kalo yang', 'terus kalau', 'nah kalo', 'kalau buat', 'kalo untuk'],
    x: ['bulan lalu', 'minggu lalu', 'kemarin', 'hari ini', 'minggu ini', 'tahun ini', 'tahun lalu', 'bulan depan', 'dua bulan lalu', 'kopi', 'bensin', 'makan siang', 'ojek', 'jajan', 'belanja', 'hiburan', 'transport', 'listrik', 'pulsa', 'parkir', 'gopay', 'bca', 'mandiri', 'ovo', 'dana', 'cash', 'tagihan', 'langganan', 'laptop baru', 'liburan', 'boba', 'skincare'],
    end: ['', 'gimana', 'berapa', 'ya', 'dong', 'sih', 'juga', 'nya'],
    more: ['kurang berapa lagi', 'sisanya berapa', 'totalnya', 'sisanya', 'yang lain', 'selain itu', 'terus yang lain', 'rata ratanya', 'per harinya', 'per minggunya', 'yang paling gede', 'yang paling kecil', 'dibanding bulan lalu', 'naik apa turun', 'lebih banyak mana', 'detailnya', 'rinciannya', 'yang mana aja', 'siapa aja', 'itu dari mana aja'],
    thing: ['target', 'sisa', 'total', 'cicilan', 'tagihan', 'saldo', 'bunga', 'jatah', 'budget', 'anggaran', 'utang', 'hasil', 'selisih', 'tabungan'],
    next: ['terus gimana', 'lalu gimana', 'terus gimana dong', 'trus gimana', 'abis itu gimana', 'terus apa lagi', 'lagi satu', 'satu lagi', 'yang sama lagi', 'sama kayak tadi', 'yang tadi lagi', 'lanjutannya'],
  }, patterns: ['{lead} {kal} {x} {end}', '{x} nya {end}', 'yang {x} {end}', '{lead} {more} {end}', '{thing}nya berapa {end}', '{lead} {thing}nya {end}', '{lead} {next} {end}'] },
  howto: { take: 500, slots: {
    how: ['cara', 'gimana cara', 'bagaimana cara', 'caranya', 'gimana caranya', 'tutorial', 'langkah', 'panduan', 'ajarin', 'kasih tau cara', 'tolong ajarin', 'bisa ajarin', 'step', 'how to'],
    feat: ['bikin anggaran', 'buat budget', 'nambah dompet', 'tambah dompet baru', 'hapus transaksi', 'edit transaksi', 'ubah kategori transaksi', 'bikin kategori baru', 'tambah subkategori', 'pasang pengingat', 'nyalain notifikasi', 'matiin notifikasi', 'scan struk', 'foto struk', 'impor mutasi', 'impor pdf bank', 'export data', 'backup data', 'ganti tema', 'ganti warna', 'pakai mode gelap', 'sembunyiin nominal', 'sembunyiin saldo', 'pasang pin', 'ganti pin', 'bikin tujuan dana', 'isi tujuan dana', 'nambah wishlist', 'catat utang', 'catat piutang', 'bayar utang', 'pakai split bill', 'bagi tagihan', 'bikin ruang bersama', 'undang pasangan', 'keluar dari ruang bersama', 'transfer antar dompet', 'catat tagihan rutin', 'atur tanggal gajian', 'hapus akun', 'ganti password', 'cocokkan saldo', 'lihat laporan', 'buka rekap', 'catat klaim kantor', 'arsipin dompet', 'ganti gaya bahasa chat', 'hapus chat'],
    tq: ['gimana', 'gimana caranya', 'gimana sih', 'caranya gimana', 'bisa ga', 'dimana', 'di mana', 'caranya'],
    where: ['dimana', 'di mana', 'letaknya dimana', 'ada dimana', 'ketemu dimana', 'nyarinya dimana', 'ada ga'],
    noun: ['menu anggaran', 'pengaturan', 'tombol scan', 'menu kategori', 'menu dompet', 'pengingat', 'notifikasi', 'tema', 'pin', 'split bill', 'ruang bersama', 'impor mutasi', 'backup', 'export', 'laporan', 'rekap', 'arena', 'wishlist', 'tujuan dana', 'tagihan rutin', 'menu utang', 'menu piutang', 'klaim kantor', 'kalkulator', 'setting'],
    want: ['mau', 'pengen', 'pingin', 'aku mau', 'gue mau', 'kalau mau'],
    tail: ['', 'dong', 'ya', 'kak', 'min', 'please'],
  }, patterns: ['{how} {feat} {tail}', '{feat} {tq}', '{want} {feat} {tq}', '{noun} {where} {tail}', 'bisa {feat} ga', 'bisa ga {feat}', 'dimana {noun}', 'nyari {noun} dimana', '{how} {feat} di aplikasi ini', 'aku ga ngerti cara {feat}'] },
  game: { take: 240, slots: {
    ask: ['main', 'maen', 'main game', 'mainan', 'ngegame', 'main suit', 'suit', 'main tebak angka', 'tebak angka', 'lempar koin', 'main lempar koin', 'main bareng', 'main sesuatu', 'main game seru'],
    go: ['yuk', 'ayo', 'kuy', 'yok', 'dong', 'skuy', 'bentar', 'sebentar'],
    why: ['bosen', 'gabut', 'lagi gabut', 'suntuk', 'jenuh', 'lagi santai', 'iseng', 'lagi nunggu', 'ngantuk'],
    game: ['game', 'mainan', 'gim', 'permainan', 'games'],
  }, patterns: ['{ask} {go}', '{go} {ask}', '{why} {ask} {go}', '{why} ajak {me} main', 'ada {game} ga', 'pengen {ask}', '{me} mau {ask}', 'ajak {me} {ask} dong', 'temenin {me} {ask}', 'mau {ask} {go}' ] },
  style: { take: 110, slots: { s: ['pakai bahasa formal', 'ngomong santai aja', 'jawab singkat aja', 'pakai lo gue', 'bahasa baku dong', 'gaya bahasa gaul', 'jangan kaku', 'pakai bahasa sopan', 'jawab pendek', 'ganti gaya bahasa'] }, patterns: ['{s} {tail}', 'bisa {s} ga'] },
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
    // 10.2 Every pattern gets its turn (round robin over each pattern's shuffled sentences), so a pattern with many
    // slots does not crowd out the short ones ("kategorinya makan malam" as much as "eh salah, …").
    const rnd = random(seed++);
    const shuffle = (list: string[]) => { for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; } return list; };
    const lists = g!.patterns.map(p => shuffle([...new Set(expand(p, g!.slots))]));
    const picked = new Set<string>();
    for (let round = 0; picked.size < g!.take && lists.some(l => l.length > round); round++) for (const l of lists) { if (picked.size >= g!.take) break; if (l[round]) picked.add(l[round]); }
    out[intent] = [...picked];
  }
  return out;
}
