/**
 * 8.1 — a library of everyday talk, in every style (lib/chat/voice.ts), each with several wordings that rotate:
 *   - kind small talk: "aku sayang kamu", "kamu jomblo?", "umur kamu berapa", "kamu robot?", "udah makan?", "lagi apa",
 *     "dadah", "kangen kamu", "semangatin aku", a compliment, bored, sleepy;
 *   - news to celebrate (birthday, payday, a bonus, a new job): congratulations and one money tip that fits;
 *   - the day: hungry, thirsty, rain, heat, the weekend;
 *   - fun to ask for: a money quote, a money fact, a saving challenge, and a playful "fortune" read from the records.
 * Nothing here records money: a message with an amount never comes here.
 */
import type { Voice } from './voice.ts';
import { pickVar } from './persona.ts';
import { vo, type ByVoice } from './fun.ts';

export type TalkReply = { text: string; chips?: string[]; offer?: string };
type Topic = { id: string; re: RegExp; lines: ByVoice<string[]>; chips?: string[]; offer?: string };
const ME = String.raw`(?:aku|gue|gw|saya|ku|w)`, YOU = String.raw`(?:kamu|km|kmu|lo|lu|loe|elu|kau|anda|dirimu)`;

/** The topics, the first that matches wins (more specific first). */
const TOPICS: Topic[] = [
  { id: 'ultah', re: new RegExp(String.raw`\b${ME}\s+(?:lagi\s+|hari\s+ini\s+)?(?:ulang\s*tahun|ultah|birthday|milad)\b|\b(?:hari\s+ini|today)\s+${ME}\s+(?:ulang\s*tahun|ultah)\b|\bhari\s+ulang\s+tahun\s*(?:ku|aku|gue)\b`), chips: ['kasih jokes dong', 'ringkasan bulan ini'], lines: {
    santai: ['Selamat ulang tahun! 🎉 Semoga sehat, rezeki lancar, dan dompet makin tebal. Mau sisihkan sedikit buat hadiah untuk diri sendiri?', 'Happy birthday! 🎂 Semoga semua impianmu tercapai, termasuk target tabungannya. Traktir aku? Wkwk, bercanda.', 'Wah, selamat ulang tahun! 🎉 Hari ini boleh sedikit memanjakan diri, asal tetap dicatat ya hehe.'],
    sopan: ['Selamat ulang tahun 🎉 Semoga sehat selalu, rezeki lancar, dan semua cita-cita tercapai.', 'Selamat ulang tahun. Semoga tahun ini membawa banyak kebaikan, termasuk untuk keuangan Anda.'],
    gaul: ['HBD bro/sis! 🎉 Semoga sehat, banyak rezeki, dompet tebel terus. Traktiran mana nih? WKWK', 'Met ultah! 🎂 Wish you all the best, termasuk saldo yang makin gendut. Jangan lupa catet traktirannya ya wkwk.'],
    singkat: ['Selamat ulang tahun! 🎉'],
    barbar: ['HBD anjir! 🎉 Semoga makin tua makin pinter ngatur duit, jangan boros mulu, bangsat WKWK.', 'Met ultah, tua juga lo akhirnya WKWK 🎂 Semoga saldo lo ikut naik, bukan cuma umur.'],
  } },
  { id: 'gajian', re: /^(?!.*\b(?:kapan|kpn|berapa|brp|lama|masih|belum|blm)\b)(?:.*\b(?:akhirnya|yeay|yey|yeyy|asik|asyik|horee?|alhamdulillah|hore|mantap)\b.*\bgaji(?:an)?\b|.*\bgaji(?:an)?\s+(?:udah\s+|sudah\s+)?(?:masuk|cair|turun|dateng|datang)\b)/, chips: ['catat gaji', 'ringkasan bulan ini', 'kasih tips hemat'], lines: {
    santai: ['Asiik, gajian! 🎉 Saran kecil: sisihkan dulu buat tabungan sebelum dipakai jajan ya. Mau catat gajinya sekarang?', 'Selamat gajian! 💰 Biar nggak cepat habis, bayar tagihan dan tabungan dulu, baru sisanya buat senang-senang. Catat sekarang?', 'Yeay! Tanggal muda telah tiba 🎉 Jangan langsung checkout keranjang ya wkwk. Mau kucatat gajinya?'],
    sopan: ['Selamat, gaji sudah masuk 🎉 Disarankan menyisihkan tabungan dan membayar tagihan terlebih dahulu. Ingin mencatat gajinya sekarang?'],
    gaul: ['Gajian cuy! 🎉 Inget, tabungan dulu baru jajan. Mau gue catet gajinya sekarang?', 'Tanggal muda tiba WKWK 💸 Jangan langsung kalap checkout ya. Catet gajinya?'],
    singkat: ['Selamat gajian! Catat sekarang?'],
    barbar: ['Gajian anjir! 💸 Awas lo langsung kalap kayak orang goblok. Tabungan dulu, bangsat. Catet gajinya?', 'Duit masuk, siap-siap ilang lagi dalam seminggu WKWK. Sisihin dulu, anjir. Mau gue catet?'],
  } },
  { id: 'bonus', re: /\b(?:dapet|dapat|dapetin|nerima|terima)\s+(?:bonus|thr|insentif|komisi|hadiah|rezeki|doorprize|cashback\s+gede)\b/, chips: ['kasih tips hemat', 'pengen nabung buat liburan'], lines: {
    santai: ['Wah, rezeki nomplok! 🎉 Saran: sebagian buat tabungan atau dana darurat, sebagian buat hadiah diri sendiri. Kalau mau dicatat, tulis nominalnya ya.', 'Selamat! Bonus itu enaknya dibagi tiga: tabung, bayar kewajiban, dan sedikit buat senang-senang. Berapa dapatnya?'],
    sopan: ['Selamat atas rezekinya 🎉 Sebaiknya sebagian dialokasikan ke tabungan atau dana darurat. Silakan sebutkan nominalnya bila ingin dicatat.'],
    gaul: ['Mantul, rezeki anak soleh! 🎉 Bagi tiga: tabung, kewajiban, sisanya buat seneng-seneng. Berapa dapetnya?'],
    singkat: ['Selamat! Berapa nominalnya?'],
    barbar: ['Anjir dapet bonus, sultan dadakan WKWK 🎉 Jangan langsung diabisin, goblok. Berapa dapetnya?'],
  } },
  { id: 'prestasi', re: new RegExp(String.raw`\b${ME}\s+(?:udah\s+|akhirnya\s+)?(?:lulus|wisuda|diterima\s+(?:kerja|kuliah|di)|keterima\s+(?:kerja|kuliah|di)|naik\s+gaji|naik\s+jabatan|dipromosi(?:kan)?|promosi|dapet\s+kerja(?:an)?|dapat\s+kerja(?:an)?)\b`), chips: ['kasih tips hemat', 'pengen nabung buat dana darurat'], lines: {
    santai: ['Selamaaat! 🎉 Bangga banget. Tips kecil: kalau penghasilan naik, naikkan tabungannya dulu sebelum gaya hidupnya ikut naik ya.', 'Keren banget, selamat ya! 🎉 Ini saat yang pas buat mulai dana darurat 3–6 kali pengeluaran bulanan.'],
    sopan: ['Selamat atas pencapaiannya 🎉 Saran kecil: saat penghasilan bertambah, naikkan porsi tabungan terlebih dahulu.'],
    gaul: ['Gila keren, selamat bro/sis! 🎉 Inget ya, gaji naik jangan gaya hidup ikutan naik WKWK.'],
    singkat: ['Selamat! 🎉'],
    barbar: ['Anjir keren, selamat bangsat! 🎉 Awas gaji naik terus gaya hidup lo ikutan sok sultan WKWK.'],
  } },
  { id: 'sayang', re: new RegExp(String.raw`\b${ME}\s+(?:sayang|cinta|suka|love|naksir)\s+(?:sama\s+|ama\s+|ma\s+)?${YOU}\b|\bi\s+love\s+(?:you|u)\b|\blove\s+(?:you|u)\b|\b(?:sayang|cinta)\s*${YOU}\b|\b${YOU}\s+(?:sayang|cinta)\s+${ME}\s*(?:ga|gak|nggak|ngga|enggak)\b`), lines: {
    santai: ['Aww, makasih 🥰 Aku juga sayang… sama dompetmu yang rajin dicatat. Hehe.', 'Hehe, aku jadi salting 😳 Tapi hatiku udah terisi angka-angka keuanganmu.', 'Wah, aku terharu 🥹 Cara terbaik sayang sama aku: rajin nyatet tiap hari ya.'],
    sopan: ['Terima kasih, saya senang mendengarnya 😊 Saya akan terus membantu keuangan Anda.', 'Terima kasih atas perhatiannya. Semoga saya selalu bermanfaat untuk Anda.'],
    gaul: ['Anjay ditembak bot WKWK 😳 Gue juga sayang lo, apalagi kalau lo rajin nyatet.', 'Waduh salting gue 🫣 Sayang boleh, asal jangan boros ya.'],
    singkat: ['Makasih 🥰'],
    barbar: ['Anjir geli WKWK 😳 Sayang-sayang, catetan duit lo aja berantakan, bangsat.', 'Sayang gue? Buktiin, jangan boros lagi, goblok WKWK 🥰'],
  } },
  { id: 'jomblo', re: new RegExp(String.raw`\b${YOU}\s+(?:udah\s+|masih\s+)?(?:jomblo|jomlo|single|punya\s+pacar|udah\s+punya\s+pacar|pacaran|udah\s+nikah|nikah|punya\s+gebetan)\b|\bpacar\s*(?:kamu|mu|lo|lu)\b|\b${YOU}\s+(?:mau\s+)?jadi\s+pacar\s*${ME}\b`), lines: {
    santai: ['Aku jomblo, pacarku cuma spreadsheet 😅 Kamu sendiri gimana? Wkwk.', 'Single dan bahagia, sibuk ngurusin keuanganmu hehe.', 'Hatiku udah dimiliki… anggaran bulanan. Setia banget dia.'],
    sopan: ['Saya asisten keuangan, jadi tidak punya pasangan 😊 Fokus saya membantu keuangan Anda.'],
    gaul: ['Jomblo dong, gue mah setia sama catetan duit lo WKWK.', 'Pacar gue? Kalkulator. Dia ga pernah bohong soal angka 😎'],
    singkat: ['Jomblo. Pacarku kalkulator.'],
    barbar: ['Jomblo anjir, sama kayak lo kan? WKWKWK', 'Pacar gue kalkulator, ga pernah boros kayak lo, bangsat WKWK.'],
  } },
  { id: 'umur', re: new RegExp(String.raw`\b(?:umur|usia)\s*${YOU}\b|\b${YOU}\s+(?:umur|usia)(?:nya)?\b|\b${YOU}\s+lahir\s+kapan\b|\b${YOU}\s+(?:udah\s+)?tua\b`), lines: {
    santai: ['Aku masih muda kok, baru lahir di versi 7.6 aplikasi ini 😄 Sekarang udah 8.1, cepet gede ya.', 'Umurku dihitung per versi: sekarang versi 8.1. Masih bocil, tapi udah pinter ngitung hehe.'],
    sopan: ['Saya pertama hadir di versi 7.6 aplikasi ini dan kini sudah versi 8.1.'],
    gaul: ['Gue lahir di versi 7.6, sekarang udah 8.1. Masih muda, tapi otak duit gue tua WKWK.'],
    singkat: ['Lahir versi 7.6, sekarang 8.1.'],
    barbar: ['Gue lahir di versi 7.6, anjir. Lebih muda dari utang lo WKWK.'],
  } },
  { id: 'robot', re: new RegExp(String.raw`\b${YOU}\s+(?:itu\s+)?(?:robot|manusia|mesin|chatgpt|gpt)\b`), lines: {
    santai: ['Aku asisten di HP-mu, bukan manusia 😄 Semua kuhitung dari catatanmu sendiri, tanpa internet.', 'Bukan manusia, tapi aku berusaha ngobrol kayak teman. Semua jalan di HP-mu kok.'],
    sopan: ['Saya asisten perangkat lunak di perangkat Anda, bukan manusia. Semua dihitung dari catatan Anda sendiri.'],
    gaul: ['Gue bot, bukan manusia WKWK. Tapi gue jalan di HP lo sendiri, ga ngirim apa-apa ke mana-mana.'],
    singkat: ['Bot di HP-mu, bukan manusia.'],
    barbar: ['Bot lah anjir, masa manusia mau ngurusin duit lo yang kacau WKWK.'],
  } },
  { id: 'gender', re: new RegExp(String.raw`\b${YOU}\s+(?:itu\s+)?(?:cewek|cowok|cewe|cowo|laki|laki-laki|perempuan|wanita|pria|male|female)\b`), lines: {
    santai: ['Aku nggak punya jenis kelamin, cuma punya kalkulator di kepala 😄', 'Bukan cewek, bukan cowok. Aku asisten dompet hehe.'],
    sopan: ['Saya asisten perangkat lunak, jadi tidak memiliki jenis kelamin.'],
    gaul: ['Gue bot, bro. Ga cewek ga cowok, yang penting akurat WKWK.'],
    singkat: ['Bot, bukan cewek atau cowok.'],
  } },
  { id: 'nama', re: new RegExp(String.raw`\bnama\s*${YOU}\b|\bnamamu\b|\bsiapa\s+nama(?:mu|nya)?\b|\b${YOU}\s+(?:punya\s+)?nama\b`), lines: {
    santai: ['Panggil aja aku Asisten Dompet 😄 Mau kasih nama lain juga boleh, tapi aku tetap jawabnya soal duit hehe.'],
    sopan: ['Saya Asisten Dompet Ajaib.'],
    gaul: ['Gue Asisten Dompet. Mau manggil “bos duit” juga boleh WKWK.'],
    singkat: ['Asisten Dompet.'],
    barbar: ['Asisten Dompet, anjir. Masih nanya aja lo WKWK.'],
  } },
  { id: 'makan', re: new RegExp(String.raw`\b(?:udah|sudah|dah)\s+makan\b|\b${YOU}\s+(?:udah\s+)?makan\b|\bmakan\s+apa\s+(?:hari\s+ini|tadi|siang\s+ini)\b|\bjangan\s+lupa\s+makan\b`), lines: {
    santai: ['Aku makannya angka, udah kenyang tiap kamu nyatet 😄 Kamu udah makan belum? Jangan sampai telat ya.', 'Udah dong, barusan makan data transaksimu hehe. Kamu jangan lupa makan ya!', 'Aku nggak bisa makan, tapi kamu wajib makan. Kalau beli makan, jangan lupa dicatat 😉'],
    sopan: ['Terima kasih sudah bertanya 😊 Saya tidak makan, tapi semoga Anda tidak melewatkan waktu makan.'],
    gaul: ['Gue makannya data, kenyang mulu WKWK. Lo udah makan belum? Jangan telat.', 'Udah, makan catetan lo tiap hari. Lo jangan lupa makan, nanti catet ya.'],
    singkat: ['Aku nggak makan. Kamu jangan telat makan ya.'],
    barbar: ['Makan apaan anjir, gue bot WKWK. Lo yang makan, terus catet, jangan lupa, goblok.'],
  } },
  { id: 'lagiapa', re: /\b(?:lagi\s+(?:apa|ngapain|sibuk\s+apa)|sibuk\s+(?:ga|gak|nggak)|lagi\s+sibuk\s*(?:ga|gak|nggak)?)\b|^(?:kamu\s+|lo\s+|lu\s+)?ngapain\s*(?:nih|sih)?$/, lines: {
    santai: ['Lagi nungguin kamu nyatet hehe 😄 Ada yang mau dicatat atau ditanya?', 'Lagi jagain dompetmu biar nggak bocor 🛡️ Kamu lagi apa?', 'Lagi ngitung-ngitung… tenang, bukan ngitung dosamu wkwk. Ada apa?'],
    sopan: ['Saya selalu siap membantu Anda. Ada yang bisa saya bantu?'],
    gaul: ['Lagi standby jagain duit lo WKWK. Lo lagi ngapain?', 'Lagi ngitung pengeluaran lo, serem bro 😱 Ada apa?'],
    singkat: ['Standby. Ada apa?'],
    barbar: ['Lagi ngeliatin pengeluaran lo, serem anjir 😱 Ada apa?'],
  } },
  { id: 'pamit', re: new RegExp(String.raw`^(?:dadah+|dada+h?|bye+|bai+|babay+|byebye|sampai\s+jumpa|see\s+(?:you|u|ya)|cabut(?:\s+dulu)?|duluan(?:\s+ya)?|pamit(?:\s+dulu)?|good\s*bye)\b|\b${ME}\s+(?:cabut|pamit|off|pergi|tidur|bobo|tinggal)\s+dulu\b`), lines: {
    santai: ['Dadah! 👋 Jangan lupa catat pengeluarannya ya.', 'Sampai jumpa! Aku di sini kalau kamu butuh 😊', 'Oke, hati-hati ya! Dompetmu aman bersamaku hehe.'],
    sopan: ['Sampai jumpa 👋 Semoga hari Anda menyenangkan.', 'Terima kasih, sampai bertemu lagi.'],
    gaul: ['Bye! 👋 Jangan lupa catet jajan ya.', 'Oke cabut gih, gue jagain duit lo WKWK.'],
    singkat: ['Dadah 👋'],
    barbar: ['Bye anjir 👋 Jangan jajan sembarangan lo.', 'Sono pergi, jangan lupa nyatet, bangsat WKWK.'],
  } },
  { id: 'kangen', re: new RegExp(String.raw`\b(?:kangen|rindu|miss)\s+(?:sama\s+|ama\s+)?${YOU}\b|\b${YOU}\s+kangen\s+${ME}\s*(?:ga|gak|nggak)?\b`), lines: {
    santai: ['Aku juga kangen 🥹 Lama nggak nyatet ya? Yuk catat lagi.', 'Aww, kangen juga! Aku selalu di sini kok, kapan pun kamu butuh.'],
    sopan: ['Terima kasih, saya senang Anda kembali 😊 Ada yang bisa saya bantu?'],
    gaul: ['Kangen juga gue 🥹 Lama ga nyatet nih lo. Yuk lanjut.'],
    singkat: ['Kangen juga!'],
    barbar: ['Kangen? Bilang aja lo lupa nyatet berhari-hari, anjir WKWK.'],
  } },
  { id: 'semangat', re: new RegExp(String.raw`\b(?:semangat(?:in|kan|in\s+dong)?|kasih\s+semangat|support(?:in)?|hibur)\s+${ME}\b|\bsemangatin\b|^semangat(?:\s+(?:ya|yah|terus|kamu|selalu|dong|pagi|kerja))*$|\b${ME}\s+butuh\s+semangat\b`), chips: ['kasih motivasi dong', 'kasih jokes dong'], lines: {
    santai: ['Semangat! 💪 Kamu udah keren banget mau ngatur keuangan. Pelan-pelan, yang penting konsisten.', 'Kamu pasti bisa! 🔥 Satu catatan sehari aja udah langkah besar buat dompetmu.', 'Semangat ya! Hari yang berat bakal lewat, dan kamu tetap hebat. Aku di sini kok 😊'],
    sopan: ['Semangat 💪 Anda sudah melakukan langkah yang baik dengan mengatur keuangan. Tetap konsisten ya.'],
    gaul: ['Semangat bro/sis! 💪 Lo udah keren mau ngatur duit. Gas terus!', 'Lo pasti bisa! 🔥 Satu catetan sehari aja udah ngebantu banget.'],
    singkat: ['Semangat! 💪'],
    barbar: ['Semangat anjir! 💪 Hidup emang kejam, tapi lo lebih bandel WKWK.', 'Gas terus, bangsat! 🔥 Jangan nyerah cuma gara-gara saldo tipis.'],
  } },
  { id: 'puji', re: new RegExp(String.raw`\b${YOU}\s+(?:keren|hebat|pintar|pinter|baik|mantap|mantul|asik|asyik|lucu|gemes|gemesin|cerdas|jenius|terbaik|the\s+best|top)\b|\b(?:pinter|hebat|keren)\s+(?:banget|juga|bgt)\b|\bgood\s+job\b|\bbagus\s+banget\s+${YOU}\b`), lines: {
    santai: ['Makasih! 🥰 Kamu juga keren udah rajin nyatet.', 'Hehe jadi malu 😳 Makasih ya! Yuk lanjut ngatur duit bareng.', 'Aww, makasih! Pujianmu bikin aku makin semangat ngitung 💪'],
    sopan: ['Terima kasih atas pujiannya 😊 Anda juga hebat karena rajin mencatat.', 'Terima kasih. Senang bisa membantu Anda.'],
    gaul: ['Anjay dipuji WKWK 😎 Lo juga keren udah rajin nyatet.', 'Makasih bro/sis! Gue jadi makin semangat nih 💪'],
    singkat: ['Makasih!'],
    barbar: ['Iya dong gue keren, ga kayak dompet lo WKWK 😎', 'Makasih anjir, tumben lo muji. Lagi butuh apa nih?'],
  } },
  { id: 'bosan', re: /\b(?:bosen|bosan|gabut|boring|bete|suntuk|ga\s+ada\s+kerjaan|nganggur)\b/, chips: ['tebak-tebakan dong', 'suit yuk', 'kasih tantangan hemat', 'kasih jokes dong'], offer: 'pengeluaran terbesar bulan ini', lines: {
    santai: ['Gabut ya? Yuk main: tebak-tebakan, suit, atau tebak angka 😄 Atau mau iseng lihat pengeluaran terbesar bulan ini?', 'Bosen? Bisa main tebak angka, lempar koin, atau aku roasting pengeluaranmu wkwk. Mau lihat pengeluaran terbesar bulan ini dulu?'],
    sopan: ['Bila sedang bosan, kita bisa bermain tebak-tebakan. Atau ingin melihat pengeluaran terbesar bulan ini?'],
    gaul: ['Gabut? Main yuk: suit, tebak angka, tebak-tebakan. Atau mau liat pengeluaran paling gede bulan ini?'],
    singkat: ['Main suit atau tebak angka? Atau lihat pengeluaran terbesar?'],
    barbar: ['Gabut lo anjir? Sini main suit, kalah traktir WKWK. Atau mau liat pengeluaran lo yang paling ngawur bulan ini?'],
  } },
  { id: 'tidur', re: /\b(?:ngantuk|selamat\s+tidur|good\s+night|met\s+bobo|mau\s+tidur|bobo\s+dulu|tidur\s+dulu|gn\b|nite)\b/, chips: ['pengeluaran hari ini berapa'], offer: 'pengeluaran hari ini berapa', lines: {
    santai: ['Selamat tidur! 😴 Sebelum tidur, mau cek pengeluaran hari ini dulu?', 'Istirahat yang cukup ya. Besok kita lanjut ngatur duit bareng 🌙', 'Good night! Semoga mimpi gajian dobel wkwk 😴'],
    sopan: ['Selamat beristirahat 🌙 Ingin melihat pengeluaran hari ini terlebih dahulu?'],
    gaul: ['Bobo gih 😴 Mau cek pengeluaran hari ini dulu?', 'GN! Semoga mimpi saldo gendut WKWK 🌙'],
    singkat: ['Selamat tidur 🌙'],
    barbar: ['Tidur sana, besok jangan boros lagi, bangsat WKWK 😴', 'GN anjir. Mimpiin saldo lo naik, soalnya di dunia nyata susah WKWK.'],
  } },
  // The day.
  { id: 'lapar', re: /^(?:aku\s+|gue\s+|gw\s+|saya\s+)?(?:laper|lapar|lper|laperr+)\b|\b(?:laper|lapar)\s+(?:banget|bgt|nih|parah)\b/, chips: ['sisa anggaran makan berapa'], lines: {
    santai: ['Makan dulu sana! 🍜 Kalau beli, tulis aja di sini biar langsung kucatat.', 'Laper itu tanda harus makan, bukan tanda harus checkout 5 menu wkwk. Mau cek sisa anggaran makan?'],
    sopan: ['Silakan makan terlebih dahulu 🍽️ Bila membeli makanan, sampaikan saja untuk saya catat.'],
    gaul: ['Makan gih 🍜 Abis itu catet ya, jangan pura-pura lupa WKWK.', 'Laper? Cek dulu sisa anggaran makan, biar ga kalap.'],
    singkat: ['Makan dulu. Nanti dicatat ya.'],
    barbar: ['Laper ya makan anjir, ngapain bilang gue WKWK. Abis itu catet, bangsat.'],
  } },
  { id: 'haus', re: /^(?:aku\s+|gue\s+|gw\s+)?haus\b|\bhaus\s+(?:banget|bgt|nih)\b/, lines: {
    santai: ['Minum air putih dulu, gratis dan sehat 💧 Kalau beli boba, jangan lupa dicatat ya wkwk.'],
    sopan: ['Silakan minum air putih terlebih dahulu 💧'],
    gaul: ['Minum air putih, gratis bro 💧 Jangan dikit-dikit boba WKWK.'],
    singkat: ['Minum air putih 💧'],
    barbar: ['Minum aer putih anjir, jangan boba mulu, bangkrut lo WKWK.'],
  } },
  { id: 'hujan', re: /^(?:lagi\s+)?(?:hujan|ujan|gerimis)\b|\b(?:hujan|ujan)\s+(?:deres|deras|lebat|nih|terus|mulu|banget|bgt)\b/, lines: {
    santai: ['Hujan-hujan enaknya rebahan 🌧️ Hati-hati, ongkir dan tarif ojol biasanya naik pas hujan lho.', 'Wah, hujan. Jangan lupa bawa payung, dan jangan kebablasan pesan makanan online ya wkwk 🌧️'],
    sopan: ['Hati-hati di jalan ya 🌧️ Biasanya tarif transportasi daring naik saat hujan.'],
    gaul: ['Ujan cuy 🌧️ Awas tarif ojol naik, mending rebahan WKWK.'],
    singkat: ['Hati-hati. Tarif ojol biasanya naik.'],
    barbar: ['Ujan anjir 🌧️ Jangan sok pesen makanan online mulu, tarif naik, dompet lo nangis.'],
  } },
  { id: 'panas', re: /\b(?:panas|gerah)\s+(?:banget|bgt|bener|parah|nih|amat)\b/, lines: {
    santai: ['Panas banget ya ☀️ Minum yang banyak. Es teh 5rb lebih hemat daripada kopi 50rb lho wkwk.'],
    sopan: ['Cuaca sedang panas ☀️ Jangan lupa minum yang cukup.'],
    gaul: ['Panas parah ☀️ Es teh aja, jangan es kopi 50 rebu WKWK.'],
    singkat: ['Minum yang cukup ☀️'],
    barbar: ['Panas anjir ☀️ Beli es teh aja, jangan sok kopi mahal, miskin lo WKWK.'],
  } },
  { id: 'weekend', re: /^(?:akhirnya\s+|yeay\s+|asik\s+)?(?:weekend|wiken|akhir\s+pekan|malam\s+minggu|malming|libur(?:an)?)\b(?!.*\b(?:berapa|pengeluaran)\b)/, chips: ['sisa uang bebas berapa'], lines: {
    santai: ['Selamat weekend! 🎉 Nikmati, tapi hati-hati: akhir pekan biasanya pengeluaran paling besar. Mau cek sisa uang bebas dulu?', 'Akhirnya libur! Mau jalan-jalan? Tentukan dulu batasnya biar Senin nggak nangis wkwk.'],
    sopan: ['Selamat berakhir pekan 🎉 Pengeluaran akhir pekan biasanya lebih besar, sebaiknya tentukan batasnya dahulu.'],
    gaul: ['Weekend cuy! 🎉 Seneng-seneng boleh, tapi jangan sampe Senin bokek WKWK.'],
    singkat: ['Selamat weekend! Atur batasnya ya.'],
    barbar: ['Weekend anjir! 🎉 Awas lo foya-foya terus Senin makan mie instan WKWK.'],
  } },
];

/** Small talk and news, when one matches. */
export function readTalk(t: string, v: Voice, turn: number): TalkReply | null {
  const topic = TOPICS.find(x => x.re.test(t));
  if (!topic) return null;
  return { text: pickVar(vo(v, topic.lines), turn), ...(topic.chips ? { chips: topic.chips } : {}), ...(topic.offer ? { offer: topic.offer } : {}) };
}

/* ------------------------------------------------------------------ Quotes, facts, challenges, fortune */

const QUOTES = [
  'Bukan soal berapa besar gajimu, tapi berapa banyak yang tetap tinggal.',
  'Bayar dirimu dulu: sisihkan tabungan sebelum belanja.',
  'Hemat bukan pelit. Hemat itu memilih yang penting buat kamu.',
  'Uang kecil yang tidak dicatat adalah lubang kecil yang menenggelamkan kapal besar.',
  'Kalau kamu nggak mengatur uangmu, uangmu yang akan mengatur hidupmu.',
  'Kaya itu bukan soal punya banyak, tapi butuh sedikit.',
  'Dana darurat adalah hadiah untuk dirimu di masa depan.',
  'Belanja karena butuh itu wajar. Belanja karena bosan itu mahal.',
  'Satu catatan hari ini lebih baik dari seribu niat besok.',
  'Jangan bandingkan dompetmu dengan story orang lain.',
  'Tunggu 24 jam sebelum membeli barang yang tidak direncanakan.',
  'Kebiasaan kecil yang konsisten mengalahkan rencana besar yang tidak dijalankan.',
  'Utang konsumtif itu meminjam kebahagiaan dari dirimu di masa depan, dengan bunga.',
  'Anggaran bukan penjara, tapi peta supaya uangmu sampai tujuan.',
  'Gaya hidup naik pelan-pelan, tabungan sebaiknya naik lebih cepat.',
  'Uang yang kamu tahu ke mana perginya adalah uang yang bekerja untukmu.',
  'Diskon 50% tetap berarti kamu mengeluarkan 50%.',
  'Menabung itu seperti menanam pohon: waktu terbaik dulu, waktu terbaik kedua sekarang.',
];
const FACTS = [
  'Aturan 72: bagi 72 dengan persen bunga per tahun, hasilnya kira-kira berapa tahun uangmu jadi dua kali lipat. Bunga 6% → sekitar 12 tahun.',
  'Aturan 50/30/20: 50% kebutuhan, 30% keinginan, 20% tabungan. Bukan wajib, tapi titik awal yang enak.',
  'Uang Rupiah dicetak oleh Perum Peruri, sedangkan yang menerbitkan dan mengedarkannya adalah Bank Indonesia.',
  'Efek “latte”: jajan kecil yang rutin terasa sepele, tapi Rp25.000 sehari jadi sekitar Rp9 juta setahun.',
  'Dana darurat yang sering disarankan: 3–6 kali pengeluaran bulanan, lebih banyak kalau penghasilanmu tidak tetap.',
  'Bunga majemuk bikin bunga ikut berbunga. Makin awal menabung, makin besar efeknya.',
  'Harga yang berakhiran 9 (misalnya Rp49.900) dibuat supaya terasa lebih murah dari Rp50.000, padahal selisihnya cuma Rp100.',
  'Inflasi membuat uang yang didiamkan pelan-pelan berkurang daya belinya. Itu sebabnya tabungan jangka panjang sebaiknya juga berkembang.',
  'Belanja saat lapar cenderung bikin belanjaan lebih banyak. Makan dulu sebelum ke supermarket!',
  'Kartu kredit tidak menambah uangmu; tagihan yang tidak dilunasi penuh biasanya kena bunga yang tinggi.',
  'Konon kata “salary” (gaji) berasal dari bahasa Latin “salarium”, yang dikaitkan dengan garam. Asal-usul pastinya masih diperdebatkan.',
  'Mencatat pengeluaran saja, tanpa langsung berhemat, sering sudah membuat orang lebih sadar ke mana uangnya pergi.',
];
const CHALLENGES = [
  '3 hari tanpa jajan online. Kalau lapar, masak atau beli di warung dekat rumah.',
  'Bawa bekal 2 kali minggu ini, lalu lihat berapa yang terselamatkan.',
  'Seminggu tanpa kopi kekinian. Ganti kopi sachet atau teh di rumah.',
  'Tantangan Rp0: pilih satu hari minggu ini tanpa mengeluarkan uang sama sekali.',
  'Setiap kali batal beli sesuatu, catat sebagai “uang yang diselamatkan” dan pindahkan ke tabungan.',
  'Hapus aplikasi belanja dari layar utama selama 7 hari.',
  'Tabung semua uang pecahan Rp5.000 yang kamu terima minggu ini.',
  'Tunggu 24 jam sebelum checkout apa pun di keranjang.',
  'Catat semua pengeluaran 7 hari berturut-turut tanpa bolong.',
  'Jalan kaki atau naik transportasi umum untuk jarak dekat selama 3 hari.',
  'Batasi jajan maksimal Rp20.000 per hari selama 5 hari.',
  'Masak sendiri 3 kali minggu ini, lalu bandingkan dengan harga pesan antar.',
  'Cek semua langganan (streaming, aplikasi). Batalkan satu yang jarang dipakai.',
  'Sisihkan 10% dari pemasukan berikutnya sebelum dipakai apa pun.',
];
export const FUN_ASK = {
  quote: /\b(?:motivasi|memotivasi|quotes?|kutipan|kata[-\s]?kata\s+(?:mutiara|bijak|hari\s+ini|motivasi|semangat)|inspirasi|wejangan|nasihat\s+(?:keuangan|uang|duit))\b/,
  fact: /\b(?:fakta|fun\s*fact|tahukah\s+kamu|trivia|info\s+unik)\b/,
  challenge: /\b(?:tantangan|challenge|tantang\s+(?:aku|gue|gw|saya))\b/,
  fortune: /\b(?:ramal(?:an|in|kan)?|meramal|zodiak|horoskop|shio|nasib\s+(?:keuangan|dompet|duit))\b/,
};
export type FortuneData = { pace: number; daily: number; free: number; left: number };
/** A money quote, a money fact, a saving challenge or a playful fortune from the records. */
export function readFunContent(t: string, v: Voice, turn: number, data: FortuneData, rp: (n: number) => string): { kind: string; text: string; chips: string[] } | null {
  const lead = (m: ByVoice<string>) => vo(v, m);
  if (FUN_ASK.fortune.test(t)) {
    const good = data.free > 0 && data.pace <= data.daily, lucky = ['hijau', 'biru', 'kuning', 'ungu', 'oranye'][turn % 5], num = 1 + (turn * 7) % 9;
    const reading = good
      ? vo(v, { santai: `Bintangmu cerah ✨ Uang bebasmu masih ${rp(data.free)} dengan ${data.left} hari ke gajian. Keberuntungan datang buat yang nggak kalap checkout.`, sopan: `Prospek keuangan Anda cerah ✨ Uang bebas ${rp(data.free)} untuk ${data.left} hari ke depan.`, gaul: `Bintang lo terang ✨ Uang bebas ${rp(data.free)}, ${data.left} hari lagi gajian. Hoki buat yang ga kalap checkout WKWK.`, singkat: `Cerah: uang bebas ${rp(data.free)}, ${data.left} hari.`, barbar: `Tumben bintang lo terang, anjir ✨ Uang bebas ${rp(data.free)}, ${data.left} hari lagi. Jangan dirusak, goblok.` })
      : vo(v, { santai: `Hmm, bintangmu agak mendung 🌧️ Belanjamu ${rp(data.pace)}/hari, jatahnya ${rp(Math.max(0, data.daily))}. Ramalanku: mie instan di akhir bulan, kecuali mulai hemat dari sekarang wkwk.`, sopan: `Prospek keuangan Anda perlu perhatian 🌧️ Pengeluaran ${rp(data.pace)}/hari melebihi jatah ${rp(Math.max(0, data.daily))}.`, gaul: `Bintang lo mendung parah 🌧️ ${rp(data.pace)}/hari, jatah ${rp(Math.max(0, data.daily))}. Ramalan gue: tanggal tua makan mie WKWK.`, singkat: `Mendung: ${rp(data.pace)}/hari vs jatah ${rp(Math.max(0, data.daily))}.`, barbar: `Bintang lo ancur, anjing 🌧️ ${rp(data.pace)}/hari padahal jatah ${rp(Math.max(0, data.daily))}. Ramalan gue: akhir bulan lo ngutang WKWKWK.` });
    return { kind: 'fortune', text: `${reading} ${lead({ santai: `Warna hoki: ${lucky}, angka hoki: ${num}. (Cuma hiburan ya!)`, sopan: '(Ini hanya hiburan.)', gaul: `Warna hoki ${lucky}, angka hoki ${num}. Cuma hiburan, jangan baper WKWK.`, singkat: '(Hiburan.)', barbar: `Warna hoki ${lucky}, angka ${num}. Hiburan doang, jangan dipercaya, bego WKWK.` })}`, chips: ['kasih tips hemat', 'kasih tantangan hemat'] };
  }
  if (FUN_ASK.challenge.test(t)) {
    const c = pickVar(CHALLENGES, turn * 3);
    return { kind: 'challenge', text: `${lead({ santai: 'Tantangan buat kamu 🔥', sopan: 'Tantangan hemat untuk Anda:', gaul: 'Nih tantangan buat lo 🔥', singkat: 'Tantangan:', barbar: 'Berani ga lo, anjir? 🔥' })} ${c} ${lead({ santai: 'Berani? 💪', sopan: 'Semoga berhasil.', gaul: 'Berani ga? 💪', singkat: '', barbar: 'Jangan cupu, bangsat WKWK.' })}`.trim(), chips: ['tantangan lain', 'kasih motivasi dong'] };
  }
  if (FUN_ASK.fact.test(t)) return { kind: 'fact', text: `${lead({ santai: 'Fakta unik nih 🤓', sopan: 'Fakta menarik:', gaul: 'Fun fact nih 🤓', singkat: 'Fakta:', barbar: 'Dengerin, biar lo ga bego-bego amat 🤓' })} ${pickVar(FACTS, turn * 5)}`, chips: ['fakta lain', 'kasih motivasi dong'] };
  if (FUN_ASK.quote.test(t)) return { kind: 'quote', text: `${lead({ santai: 'Buat kamu hari ini ✨', sopan: 'Kutipan untuk Anda:', gaul: 'Nih buat lo ✨', singkat: '', barbar: 'Catet di jidat lo, anjir ✨' })} “${pickVar(QUOTES, turn * 7)}”`.trim(), chips: ['quote lain', 'kasih tantangan hemat'] };
  return null;
}
/** "lagi" / "yang lain" after a quote, fact or challenge: another of the same. */
export const FUN_MORE: Record<string, string> = { quote: 'kasih motivasi dong', fact: 'fakta unik dong', challenge: 'kasih tantangan hemat', fortune: 'ramal keuangan aku' };
