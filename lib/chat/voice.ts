/**
 * How the assistant talks: four styles the person picks in the chat settings (or by saying "pakai bahasa formal").
 * Santai (aku–kamu, the default), Sopan (saya–Anda), Singkat (as few words as possible), Gaul (gue–lo).
 * Every sentence the assistant says is here, so a style changes all of them at once.
 */
export type Voice = 'santai' | 'sopan' | 'singkat' | 'gaul';
export const VOICES: { key: Voice; name: string; sample: string }[] = [
  { key: 'santai', name: 'Santai', sample: 'Oke, nominalnya kuganti jadi Rp45.000. Udah pas?' },
  { key: 'sopan', name: 'Sopan', sample: 'Baik, nominalnya saya ubah menjadi Rp45.000. Apakah sudah sesuai?' },
  { key: 'singkat', name: 'Singkat', sample: 'Rp45.000. Simpan?' },
  { key: 'gaul', name: 'Gaul', sample: 'Siap, gue ganti jadi Rp45.000 ya. Udah bener belum?' },
];

type Lines = Record<Voice, string>;
const pick = (v: Voice, l: Lines) => l[v] ?? l.santai;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "-mu" / "Anda" / "lo" in the middle of a sentence. */
export const you = (v: Voice) => v === 'sopan' ? 'Anda' : v === 'gaul' ? 'lo' : 'kamu';
export const yours = (v: Voice, noun: string) => v === 'sopan' ? `${noun} Anda` : v === 'gaul' ? `${noun} lo` : `${noun}mu`;

export const say = {
  greet: (v: Voice, part: string, name: string) => pick(v, {
    santai: `Selamat ${part}${name}! Mau catat, tanya, atau hitung apa hari ini?`,
    sopan: `Selamat ${part}${name}. Ada yang bisa saya bantu? Anda bisa mencatat, bertanya, atau menghitung.`,
    singkat: `${cap(part)}${name}! Catat, tanya, atau hitung?`,
    gaul: `Yo${name}! Mau nyatet, nanya, atau ngitung apa nih?`,
  }),
  thanks: (v: Voice) => pick(v, { santai: 'Sama-sama! Kabari lagi kalau ada yang mau dicatat.', sopan: 'Sama-sama. Silakan hubungi saya lagi kapan saja.', singkat: 'Sama-sama!', gaul: 'Santuy, kabarin aja kalau ada lagi!' }),
  ackPending: (v: Voice) => pick(v, { santai: 'Oke. Kartunya tinggal disimpan, atau bilang kalau ada yang mau diubah.', sopan: 'Baik. Silakan tekan Simpan, atau sampaikan bagian yang ingin diubah.', singkat: 'Tinggal Simpan.', gaul: 'Sip. Tinggal pencet Simpan, atau bilang aja mau ganti apa.' }),
  ack: (v: Voice) => pick(v, { santai: 'Siap!', sopan: 'Baik.', singkat: 'Oke.', gaul: 'Sip!' }),
  about: (v: Voice) => pick(v, {
    santai: 'Aku asisten Dompet Ajaib. Semua kubaca dan kuhitung di HP-mu dari catatanmu sendiri, tanpa dikirim ke mana-mana. Aku bisa mencatat, menjawab pertanyaan soal uangmu, menghitung, dan memberi ringkasan.',
    sopan: 'Saya asisten Dompet Ajaib. Semua dibaca dan dihitung di perangkat Anda dari catatan Anda sendiri, tanpa dikirim ke mana pun. Saya dapat mencatat, menjawab pertanyaan keuangan, menghitung, dan memberi ringkasan.',
    singkat: 'Asisten Dompet Ajaib. Jalan di HP-mu, tanpa internet. Catat, tanya, hitung, ringkasan.',
    gaul: 'Gue asisten Dompet Ajaib. Semua gue baca di HP lo sendiri, nggak dikirim ke mana-mana. Bisa nyatet, jawab soal duit lo, ngitung, sama bikin ringkasan.',
  }),
  helpLead: (v: Voice) => pick(v, { santai: 'Tulis seperti chat biasa. Contohnya:', sopan: 'Silakan menulis seperti percakapan biasa. Contohnya:', singkat: 'Contoh:', gaul: 'Ketik aja kayak ngechat biasa. Misalnya:' }),
  examplesLead: (v: Voice) => pick(v, { santai: 'Ketuk salah satu untuk mencoba:', sopan: 'Silakan pilih salah satu untuk mencoba:', singkat: 'Coba:', gaul: 'Pencet salah satu buat nyoba:' }),
  cancel: (v: Voice) => pick(v, { santai: 'Oke, tidak jadi dicatat.', sopan: 'Baik, catatan tersebut tidak disimpan.', singkat: 'Dibatalkan.', gaul: 'Oke, nggak jadi dicatat.' }),
  undoIntro: (v: Voice) => pick(v, { santai: 'Ini catatan terakhirmu. Yakin dihapus?', sopan: 'Berikut catatan terakhir Anda. Yakin ingin menghapusnya?', singkat: 'Hapus yang ini?', gaul: 'Ini catatan terakhir lo. Yakin mau dihapus?' }),
  confirm: (v: Voice, many: boolean) => pick(v, {
    santai: many ? 'Ini yang kutangkap. Cek sebentar, lalu Simpan semua.' : 'Ini yang kutangkap. Udah pas? Tinggal Simpan, atau bilang yang mau diubah.',
    sopan: many ? 'Berikut yang saya tangkap. Silakan periksa, lalu Simpan semua.' : 'Berikut yang saya tangkap. Apakah sudah sesuai? Silakan Simpan, atau sampaikan yang ingin diubah.',
    singkat: '', gaul: many ? 'Nih yang gue tangkep. Cek dulu, terus Simpan semua.' : 'Nih yang gue tangkep. Udah bener? Pencet Simpan atau bilang mau ganti apa.',
  }),
  edited: (v: Voice, what: string) => pick(v, { santai: `Oke, ${what}. Udah pas?`, sopan: `Baik, ${what}. Apakah sudah sesuai?`, singkat: `${cap(what)}.`, gaul: `Siap, ${what}. Udah bener belum?` }),
  editAmount: (v: Voice, rp: string) => pick(v, { santai: `nominalnya kuganti jadi ${rp}`, sopan: `nominalnya saya ubah menjadi ${rp}`, singkat: rp, gaul: `gue ganti jadi ${rp}` }),
  editWallet: (v: Voice, name: string) => pick(v, { santai: `pakai ${name}`, sopan: `menggunakan ${name}`, singkat: name, gaul: `pake ${name}` }),
  editDate: (v: Voice, date: string) => pick(v, { santai: `tanggalnya ${date}`, sopan: `tanggalnya ${date}`, singkat: date, gaul: `tanggalnya ${date}` }),
  editCategory: (v: Voice, cat: string) => pick(v, { santai: `kategorinya ${cat}`, sopan: `kategorinya ${cat}`, singkat: cat, gaul: `kategorinya ${cat}` }),
  editSplit: (v: Voice) => pick(v, { santai: 'kubagi', sopan: 'saya bagi', singkat: 'dibagi', gaul: 'gue bagi' }),
  savedAmount: (v: Voice, rp: string) => pick(v, { santai: `Catatan tadi sudah tersimpan. Kuubah nominalnya jadi ${rp}?`, sopan: `Catatan tadi sudah tersimpan. Ubah nominalnya menjadi ${rp}?`, singkat: `Ubah jadi ${rp}?`, gaul: `Yang tadi udah kesimpen. Mau gue ganti jadi ${rp}?` }),
  savedDate: (v: Voice, date: string) => pick(v, { santai: `Catatan tadi sudah tersimpan. Kupindah ke ${date}?`, sopan: `Catatan tadi sudah tersimpan. Pindahkan ke ${date}?`, singkat: `Pindah ke ${date}?`, gaul: `Yang tadi udah kesimpen. Pindahin ke ${date}?` }),
  savedOther: (v: Voice, what: string) => pick(v, { santai: `Catatan tadi sudah tersimpan. ${what}nya diubah lewat Transaksi: ketuk catatannya lalu Ubah.`, sopan: `Catatan tadi sudah tersimpan. ${what} dapat diubah melalui menu Transaksi.`, singkat: `Ubah ${what.toLowerCase()} lewat Transaksi.`, gaul: `Yang tadi udah kesimpen. ${what}nya ganti lewat Transaksi ya.` }),
  walletMissing: (v: Voice, w: string) => pick(v, { santai: `Dompet “${w}” belum ada di daftar dompetmu. Pilih salah satu:`, sopan: `Dompet “${w}” belum terdaftar. Silakan pilih salah satu:`, singkat: `“${w}” belum ada. Pilih:`, gaul: `Dompet “${w}” belum ada di daftar lo. Pilih yang ini aja:` }),
  ask: (v: Voice, field: 'amount' | 'wallet' | 'to' | 'category' | 'date') => pick(v, {
    santai: { amount: 'Nominalnya berapa?', wallet: 'Pakai dompet mana?', to: 'Ke dompet mana?', category: 'Masuk kategori apa?', date: 'Tanggal berapa?' }[field],
    sopan: { amount: 'Berapa nominalnya?', wallet: 'Menggunakan dompet yang mana?', to: 'Ditujukan ke dompet yang mana?', category: 'Masuk ke kategori apa?', date: 'Tanggal berapa?' }[field],
    singkat: { amount: 'Berapa?', wallet: 'Dompet?', to: 'Ke mana?', category: 'Kategori?', date: 'Tanggal?' }[field],
    gaul: { amount: 'Berapa duitnya?', wallet: 'Pake dompet apa?', to: 'Ke dompet mana?', category: 'Masuk kategori apa nih?', date: 'Tanggal berapa?' }[field],
  }),
  askLead: (v: Voice) => pick(v, { santai: 'Satu lagi: ', sopan: 'Satu hal lagi: ', singkat: '', gaul: 'Eh satu lagi: ' }),
  unknown: (v: Voice) => pick(v, { santai: 'Hmm, aku belum nangkep maksudnya. Coba tulis seperti ini:', sopan: 'Mohon maaf, saya belum memahami maksudnya. Silakan coba seperti ini:', singkat: 'Belum paham. Contoh:', gaul: 'Waduh, gue belum ngeh maksudnya. Coba gini:' }),
  unanswered: (v: Voice) => pick(v, { santai: 'Yang itu belum bisa kujawab dari catatanmu. Coba tanya seperti ini:', sopan: 'Pertanyaan tersebut belum dapat saya jawab dari catatan Anda. Silakan coba seperti ini:', singkat: 'Belum bisa dijawab. Coba:', gaul: 'Yang itu gue belum bisa jawab dari catatan lo. Coba gini:' }),
  needPrice: (v: Voice) => pick(v, { santai: 'Harganya berapa? Tulis misalnya “aman nggak beli sepatu 500rb?”.', sopan: 'Berapa harganya? Contoh: “aman tidak beli sepatu 500rb?”.', singkat: 'Harganya?', gaul: 'Harganya berapa? Contoh: “aman ga beli sepatu 500rb?”.' }),
  learned: (v: Voice, phrase: string) => pick(v, { santai: `Kuingat, “${phrase}” maksudnya ini.`, sopan: `Saya ingat, “${phrase}” berarti ini.`, singkat: '', gaul: `Gue inget, “${phrase}” maksudnya ini.` }),
  voiceSet: (v: Voice) => pick(v, { santai: 'Oke, mulai sekarang aku ngobrol santai ya.', sopan: 'Baik, mulai sekarang saya akan menggunakan bahasa yang sopan.', singkat: 'Oke. Jawaban singkat.', gaul: 'Sip, mulai sekarang gue pake lo-gue ya.' }),
  voiceAsk: (v: Voice) => pick(v, { santai: 'Mau aku ngomong dengan gaya apa?', sopan: 'Gaya bahasa seperti apa yang Anda inginkan?', singkat: 'Pilih gaya:', gaul: 'Mau gue ngomong gaya apa?' }),
  calcNote: (v: Voice) => pick(v, { santai: 'Dibulatkan ke rupiah terdekat.', sopan: 'Dibulatkan ke rupiah terdekat.', singkat: 'Dibulatkan.', gaul: 'Dibuletin ke rupiah terdekat.' }),
  summaryTitle: 'Ringkasan',
  summaryLead: (v: Voice, label: string, n: number) => pick(v, {
    santai: `Ringkasan ${label}: ${n ? `${n} catatan.` : 'belum ada catatan.'}`, sopan: `Ringkasan ${label}: ${n ? `${n} catatan.` : 'belum ada catatan.'}`,
    singkat: `${cap(label)}: ${n} catatan.`, gaul: `Rekap ${label}: ${n ? `${n} catatan.` : 'belum ada catatan.'}`,
  }),
  summaryTop: (v: Voice, list: string) => pick(v, { santai: `Paling banyak di ${list}.`, sopan: `Pengeluaran terbesar: ${list}.`, singkat: `Terbesar: ${list}.`, gaul: `Paling boros di ${list}.` }),
  summaryWarn: (v: Voice, list: string) => pick(v, { santai: `Anggaran yang hampir habis: ${list}.`, sopan: `Anggaran yang hampir habis: ${list}.`, singkat: `Hampir habis: ${list}.`, gaul: `Anggaran yang udah mepet: ${list}.` }),
  affordNo: (v: Voice, free: string, short: string, item: string) => pick(v, {
    santai: `Belum aman. Uang bebasmu ${free}, kurang ${short} untuk ${item}. Coba tunggu gajian atau sisihkan dulu sedikit-sedikit.`,
    sopan: `Belum aman. Uang bebas Anda ${free}, masih kurang ${short} untuk ${item}. Sebaiknya menunggu gajian atau menyisihkan secara bertahap.`,
    singkat: `Belum aman. Kurang ${short}.`, gaul: `Belum aman nih. Uang bebas lo ${free}, kurang ${short} buat ${item}. Tunggu gajian dulu atau nabung pelan-pelan.`,
  }),
  affordTight: (v: Voice, daily: string, days: number, pace: string) => pick(v, {
    santai: `Bisa, tapi mepet. Setelah beli, jatahmu ${daily}/hari selama ${days} hari, lebih kecil dari rata-rata pengeluaranmu ${pace}/hari periode ini.`,
    sopan: `Bisa, namun cukup mepet. Setelah membeli, jatah Anda ${daily}/hari selama ${days} hari, lebih kecil dari rata-rata pengeluaran Anda ${pace}/hari.`,
    singkat: `Bisa, tapi mepet: ${daily}/hari.`, gaul: `Bisa sih, tapi mepet. Abis beli, jatah lo ${daily}/hari selama ${days} hari, lebih kecil dari rata-rata jajan lo ${pace}/hari.`,
  }),
  affordOk: (v: Voice, after: string, daily: string) => pick(v, {
    santai: `Aman. Setelah beli masih ada ${after} uang bebas, sekitar ${daily}/hari sampai gajian.`,
    sopan: `Aman. Setelah membeli masih tersisa ${after} uang bebas, sekitar ${daily}/hari hingga gajian.`,
    singkat: `Aman. Sisa ${after}.`, gaul: `Aman kok. Abis beli masih ada ${after} uang bebas, kira-kira ${daily}/hari sampe gajian.`,
  }),
  affordBudget: (v: Voice, name: string, left: string) => pick(v, { santai: ` Tapi anggaran ${name} tinggal ${left}.`, sopan: ` Namun anggaran ${name} tinggal ${left}.`, singkat: ` Anggaran ${name}: ${left}.`, gaul: ` Tapi anggaran ${name} tinggal ${left}.` }),
  affordNote: (v: Voice) => pick(v, { santai: 'Dihitung dari uang bebas dan pengeluaranmu sendiri. Keputusan tetap di tanganmu.', sopan: 'Dihitung dari uang bebas dan pengeluaran Anda. Keputusan tetap di tangan Anda.', singkat: '', gaul: 'Dihitung dari duit lo sendiri. Keputusan tetep di tangan lo.' }),
  budgetNone: (v: Voice) => pick(v, { santai: 'Kamu belum punya anggaran. Mau bikin? Tulis misalnya “anggaran makan 2jt”.', sopan: 'Anda belum memiliki anggaran. Silakan buat, misalnya “anggaran makan 2jt”.', singkat: 'Belum ada anggaran. Contoh: “anggaran makan 2jt”.', gaul: 'Lo belum punya anggaran nih. Bikin yuk, misalnya “anggaran makan 2jt”.' }),
  budgetLead: (v: Voice, n: number, over: string[], close: string[]) => {
    const o = over.join(', '), c = close.join(', ');
    if (!over.length && !close.length) return pick(v, { santai: `Semua ${n} anggaranmu masih aman.`, sopan: `Seluruh ${n} anggaran Anda masih aman.`, singkat: `${n} anggaran, semua aman.`, gaul: `${n} anggaran lo masih aman semua.` });
    return pick(v, {
      santai: [over.length ? `Anggaran ${o} sudah lewat batas.` : '', close.length ? `${cap(c)} hampir habis, pelan-pelan ya.` : ''].filter(Boolean).join(' '),
      sopan: [over.length ? `Anggaran ${o} telah melewati batas.` : '', close.length ? `Anggaran ${c} hampir habis.` : ''].filter(Boolean).join(' '),
      singkat: [over.length ? `Lewat: ${o}.` : '', close.length ? `Hampir habis: ${c}.` : ''].filter(Boolean).join(' '),
      gaul: [over.length ? `Anggaran ${o} udah jebol.` : '', close.length ? `${cap(c)} udah mepet, rem dikit ya.` : ''].filter(Boolean).join(' '),
    });
  },
  payday: (v: Voice, days: number, daily: string, free: boolean, tight: boolean) => !free ? pick(v, {
    santai: `Uang bebasmu sedang habis, jadi ${days} hari ke depan dahulukan kebutuhan pokok dan tagihan dulu ya.`,
    sopan: `Uang bebas Anda sedang habis. Selama ${days} hari ke depan, sebaiknya dahulukan kebutuhan pokok dan tagihan.`,
    singkat: `${days} hari lagi. Uang bebas habis.`, gaul: `Duit bebas lo lagi abis, ${days} hari ke depan dahuluin yang penting dulu ya.`,
  }) : pick(v, {
    santai: `Supaya cukup sampai gajian, jatahmu sekitar ${daily} per hari.${tight ? ' Ini lebih kecil dari rata-rata belanjamu, jadi agak direm ya.' : ' Masih di atas rata-rata belanjamu, aman.'}`,
    sopan: `Agar cukup hingga gajian, jatah Anda sekitar ${daily} per hari.${tight ? ' Angka ini di bawah rata-rata pengeluaran Anda, sebaiknya sedikit dikurangi.' : ' Masih di atas rata-rata pengeluaran Anda.'}`,
    singkat: `${days} hari lagi. Jatah ${daily}/hari.${tight ? ' Mepet.' : ''}`,
    gaul: `Biar cukup sampe gajian, jatah lo ${daily} sehari.${tight ? ' Lebih kecil dari kebiasaan jajan lo, rem dikit ya.' : ' Masih aman kok.'}`,
  }),
  mood: (v: Voice, free: string | null, daily: string, days: number) => pick(v, {
    santai: `Wajar kok kepikiran, urusan uang memang bikin capek. Kita lihat pelan-pelan ya. ${free ? `Kabar baiknya, masih ada ${free} uang bebas, sekitar ${daily} per hari untuk ${days} hari ke gajian.` : 'Uang bebasmu sedang habis, jadi kita fokus ke yang pokok dulu.'}`,
    sopan: `Wajar bila Anda merasa khawatir. Mari kita lihat bersama. ${free ? `Masih tersedia ${free} uang bebas, sekitar ${daily} per hari untuk ${days} hari hingga gajian.` : 'Uang bebas Anda sedang habis, mari dahulukan kebutuhan pokok.'}`,
    singkat: free ? `Tenang. Uang bebas ${free}, ${daily}/hari, ${days} hari ke gajian.` : 'Tenang. Uang bebas habis, dahulukan yang pokok.',
    gaul: `Santai, wajar kok pusing soal duit. Kita bedah bareng ya. ${free ? `Lo masih punya ${free} uang bebas, kira-kira ${daily} sehari buat ${days} hari ke gajian.` : 'Duit bebas lo lagi abis, fokus yang penting dulu.'}`,
  }),
  moodSteps: (v: Voice) => v === 'sopan' ? ['Tunda belanja yang tidak mendesak sampai gajian.', 'Catat setiap pengeluaran kecil agar terlihat ke mana uang pergi.', 'Pilih satu kategori untuk dihemat minggu ini.'] : v === 'gaul' ? ['Tahan dulu belanja yang bisa nunggu gajian.', 'Catat jajan kecil-kecil, biar keliatan bocornya di mana.', 'Pilih satu pos buat dihemat minggu ini.'] : ['Tahan dulu belanja yang bisa menunggu gajian.', 'Catat juga jajan kecil, biar kelihatan bocornya di mana.', 'Pilih satu pos untuk dihemat minggu ini.'],
  small: (v: Voice, kind: 'kabar' | 'bosan' | 'tidur' | 'puji' | 'kamu' | 'galau') => pick(v, {
    santai: { kabar: 'Baik dong! Aku selalu siap bantu. Kamu sendiri gimana, keuanganmu aman?', bosan: 'Yuk iseng cek keuangan! Misalnya lihat pengeluaran terbesar bulan ini, atau coba tantangan hemat hari ini.', tidur: 'Istirahat yang cukup ya. Sebelum tidur, mau cek pengeluaran hari ini dulu?', puji: 'Makasih! Kamu juga keren udah rajin nyatet.', kamu: 'Aku asisten kecil di HP-mu. Kerjaanku nyatet, ngitung, dan jawab soal uangmu. Ada yang mau dicatat?', galau: 'Semoga cepat membaik ya. Kalau ada yang bikin kepikiran soal uang, cerita aja, kita lihat bareng.' }[kind],
    sopan: { kabar: 'Kabar saya baik, terima kasih. Bagaimana dengan keuangan Anda, apakah aman?', bosan: 'Bagaimana kalau kita meninjau keuangan Anda? Misalnya pengeluaran terbesar bulan ini.', tidur: 'Selamat beristirahat. Ingin melihat pengeluaran hari ini terlebih dahulu?', puji: 'Terima kasih. Anda juga hebat karena rajin mencatat.', kamu: 'Saya asisten Dompet Ajaib di perangkat Anda. Saya membantu mencatat, menghitung, dan menjawab pertanyaan keuangan.', galau: 'Semoga lekas membaik. Bila ada hal keuangan yang mengganggu, silakan ceritakan.' }[kind],
    singkat: { kabar: 'Baik! Keuanganmu?', bosan: 'Cek keuangan yuk.', tidur: 'Selamat istirahat.', puji: 'Makasih!', kamu: 'Asisten Dompet Ajaib.', galau: 'Semoga membaik.' }[kind],
    gaul: { kabar: 'Baik dong! Gue standby terus. Lo sendiri gimana, duit aman?', bosan: 'Gabut? Yuk iseng cek duit, misalnya pengeluaran paling gede bulan ini, atau tantangan hemat hari ini.', tidur: 'Istirahat gih. Mau cek pengeluaran hari ini dulu sebelum bobo?', puji: 'Makasih! Lo juga keren udah rajin nyatet.', kamu: 'Gue asisten kecil di HP lo. Kerjaan gue nyatet, ngitung, jawab soal duit lo. Ada yang mau dicatet?', galau: 'Semoga cepet enakan ya. Kalau ada yang bikin kepikiran soal duit, cerita aja.' }[kind],
  }),
  goal: (v: Voice, thing: string, plan: string | null) => pick(v, {
    santai: `Keren, nabung buat ${thing}! ${plan || 'Berapa targetnya? Pilih atau tulis sendiri, nanti kubuatkan tujuan dananya.'}`,
    sopan: `Baik, menabung untuk ${thing}. ${plan || 'Berapa target dananya? Silakan pilih atau tulis sendiri, saya buatkan tujuan dananya.'}`,
    singkat: `Nabung buat ${thing}. ${plan || 'Targetnya?'}`,
    gaul: `Mantap, nabung buat ${thing}! ${plan || 'Targetnya berapa? Pilih aja atau tulis sendiri, nanti gue bikinin tujuan dananya.'}`,
  }),
  goalPlan: (v: Voice, m12: string) => pick(v, {
    santai: `Sisihkan ${m12} per bulan supaya tercapai dalam setahun.`, sopan: `Sisihkan ${m12} per bulan agar tercapai dalam setahun.`,
    singkat: `${m12}/bulan, setahun.`, gaul: `Sisihin ${m12} sebulan biar kelar setahun.`,
  }),
  goalSave: (v: Voice) => pick(v, { santai: 'Ketuk tombol di bawah untuk membuat tujuan dananya.', sopan: 'Ketuk tombol di bawah untuk membuat tujuan dana.', singkat: '', gaul: 'Pencet tombol di bawah buat bikin tujuan dananya.' }),
  tipsLead: (v: Voice) => pick(v, { santai: 'Ini yang kulihat dari catatanmu:', sopan: 'Berikut yang saya lihat dari catatan Anda:', singkat: 'Tips:', gaul: 'Nih yang gue liat dari catatan lo:' }),
};
