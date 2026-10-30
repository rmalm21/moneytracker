/**
 * Chatbot v2 (7.8): the assistant's personality. Jokes and pantun (each with what makes it funny, for "maksudnya?"),
 * banter, replies to anger and apologies, listening when the person vents (by topic, first and later turns), and the
 * words for teaching it. Every list has variants so a conversation does not repeat itself; `pickVar` rotates by turn.
 * All written for this app, in the four voices of lib/chat/voice.ts where the wording differs.
 */
import type { Voice } from './voice.ts';

export const pickVar = <T>(list: T[], turn: number) => list[((turn % list.length) + list.length) % list.length];

export type Joke = { text: string; why: string };
/** Clean, everyday, mostly about money. */
export const JOKES: Joke[] = [
  { text: 'Kenapa dompet suka minder? Soalnya isinya sering ninggalin dia duluan.', why: 'Uang sering cepat habis, seolah-olah “pergi meninggalkan” dompet.' },
  { text: 'Uang apa yang paling cepat hilang? Uang yang nggak dicatat.', why: 'Pengeluaran yang tidak dicatat terasa “hilang” karena kita lupa ke mana perginya.' },
  { text: 'Jalan-jalan ke Pasar Baru, jangan lupa beli kedondong. Gajian baru seminggu lalu, kok dompet udah melompong?', why: 'Ini pantun tentang gaji yang cepat habis. Baru seminggu gajian, dompet sudah kosong (melompong).' },
  { text: 'Apa persamaan diet sama nabung? Sama-sama mulainya hari Senin, nyerahnya hari Selasa.', why: 'Banyak orang berniat mulai diet dan menabung hari Senin, tapi cepat menyerah.' },
  { text: 'Kenapa ATM nggak pernah kesepian? Soalnya tiap hari ada yang ngantre pengen ketemu.', why: 'Orang selalu antre di ATM, seperti antre ingin bertemu seseorang.' },
  { text: 'Apa persamaan gaji sama kembang api? Ditunggu lama, habisnya cuma sebentar.', why: 'Gaji ditunggu sebulan, tapi cepat habis, seperti kembang api yang lama disiapkan dan cepat padam.' },
  { text: 'Kenapa celengan ayam nggak bisa terbang? Perutnya kebanyakan receh.', why: 'Celengan berbentuk ayam diisi uang receh sampai berat, jadi “tidak bisa terbang”.' },
  { text: 'Kenapa angka nol suka sombong? Soalnya kalau ditaruh di belakang, dia langsung bikin semuanya lebih berharga.', why: 'Menambah angka nol di belakang membuat nominal jadi sepuluh kali lebih besar.' },
  { text: 'Kata orang, uang nggak bisa beli kebahagiaan. Tapi uang bisa beli martabak, dan martabak bikin bahagia. Jadi ya… gitu deh.', why: 'Logikanya sengaja dibuat-buat, dari “uang tidak bisa membeli kebahagiaan” jadi “uang bisa membeli martabak yang membahagiakan”.' },
  { text: 'Aku nggak boros kok. Uangku aja yang terlalu ramah sama kasir.', why: 'Ini alasan lucu untuk boros, yaitu menyalahkan uang yang terlalu “akrab” dengan kasir.' },
  { text: 'Tanggal tua itu kayak mantan: datangnya pasti, tapi tetap aja bikin kaget.', why: 'Tanggal tua (akhir bulan, uang menipis) selalu datang tiap bulan, tapi tetap terasa mengejutkan.' },
  { text: 'Hobi baru: buka aplikasi bank, lihat saldo, terus pura-pura nggak lihat.', why: 'Kebiasaan menghindari kenyataan saat saldo sedang tipis.' },
  { text: 'Ikan hiu beli tomat, catat jajan biar hemat.', why: 'Plesetan pantun terkenal “ikan hiu makan tomat”, diubah jadi pesan untuk mencatat jajan.' },
  { text: 'Buah semangka buah durian, jangan lupa catat pengeluaran.', why: 'Ini pantun dua baris. Baris pertama cuma pembuka yang berima, baris kedua pesannya.' },
  { text: 'Pergi ke pasar membeli roti, rotinya dibungkus kertas koran. Kalau mau nabung mulai dari hati, jangan nunggu dapat THR-an.', why: 'Ini pantun tentang menabung. Mulai sekarang dari niat, jangan menunggu dapat THR.' },
  { text: 'Kenapa kopi kekinian mahal? Karena yang dibeli bukan kopinya, tapi perasaan “aku pantas dapat ini”.', why: 'Ini sindiran halus, karena kita sering membayar suasana dan rasa “memanjakan diri”, bukan kopinya.' },
  { text: 'Checkout pas tanggal muda itu bukan boros, itu merayakan gajian. Masalahnya, aku merayakannya tiap hari.', why: 'Alasan “merayakan gajian” jadi lucu karena dilakukan setiap hari.' },
  { text: 'Tebak-tebakan: dompet apa yang paling setia? Dompet kosong, soalnya nggak pernah ada yang ngambil isinya.', why: 'Dompet kosong “aman” dari pengeluaran karena memang tidak ada isinya.' },
  { text: 'Kamu tuh kayak anggaran: kalau nggak ada kamu, hidupku berantakan.', why: 'Ini gombalan. Anggaran membuat keuangan teratur, sama seperti kamu membuat hidup teratur.' },
  { text: 'Kamu itu kayak bunga deposito: diam-diam bikin hatiku tumbuh.', why: 'Ini gombalan. Bunga deposito membuat tabungan bertambah pelan-pelan, seperti rasa sayang.' },
  { text: 'Dompetku boleh tipis, tapi perhatianku ke kamu tebal kok.', why: 'Ini gombalan yang membandingkan dompet yang tipis dengan perhatian yang “tebal”.' },
  { text: 'Apa bedanya kamu sama promo? Promo ada masa berlakunya, kamu nggak.', why: 'Ini gombalan. Promo cepat berakhir, sedangkan kamu “berlaku selamanya”.' },
  { text: 'Kenapa kalkulator nggak pernah galau? Soalnya semua masalahnya bisa dia hitung sendiri.', why: 'Kalkulator memang tugasnya “menghitung” soal, sedangkan galau sering karena masalah yang terasa tidak terhitung.' },
  { text: 'Aku pengen jadi tabungan aja. Makin lama didiemin, makin berharga.', why: 'Tabungan bertambah nilainya kalau tidak diambil, beda dengan perasaan yang didiamkan.' },
  // 8.0 — more, and less stiff.
  { text: 'Gaji itu kayak wifi tetangga: ada sinyalnya, tapi nggak pernah benar-benar punya kita. Wkwk.', why: 'Gaji cepat habis untuk tagihan, jadi rasanya seperti “numpang lewat”, mirip wifi tetangga yang bisa dilihat tapi bukan milik kita.' },
  { text: 'Dompetku tuh kayak bawang: tiap dibuka bikin nangis.', why: 'Mengupas bawang membuat mata berair, sama seperti membuka dompet yang isinya tipis.' },
  { text: 'Saldo tanggal 25: “Halo sultan!” Saldo tanggal 5: “Siapa ya?” WKWK.', why: 'Saat gajian kita merasa kaya (sultan), awal bulan berikutnya saldo sudah tidak dikenali lagi karena habis.' },
  { text: 'Niatnya beli satu barang di marketplace, pulang-pulang bawa keranjang isi 12. Gratis ongkir emang jebakan batman.', why: '“Gratis ongkir” sering membuat kita belanja lebih banyak dari rencana. “Jebakan batman” artinya jebakan yang tidak disadari.' },
  { text: 'Kata dokter aku kekurangan vitamin D. Ternyata D-nya “Duit”. HAHAHA.', why: 'Plesetan vitamin D menjadi “Duit”: yang kurang sebenarnya uang.' },
  { text: 'Aku rajin olahraga kok: tiap akhir bulan lari dari tagihan.', why: '“Lari dari tagihan” artinya menghindari tagihan, dibuat seolah-olah olahraga lari.' },
  { text: 'Uang memang bukan segalanya. Tapi segalanya butuh uang. Termasuk beli kuota buat baca kalimat ini.', why: 'Pernyataan “uang bukan segalanya” dibalik: hampir semua hal tetap perlu uang, bahkan kuota internet.' },
  { text: 'Cicilan itu satu-satunya hubungan yang paling setia: tiap bulan datang, nggak pernah lupa.', why: 'Cicilan selalu datang tiap bulan tanpa absen, dibandingkan dengan pasangan yang setia.' },
  { text: 'Pinjam dulu seratus? Itu kalimat paling horor setelah “kita perlu bicara”.', why: '“Pinjam dulu seratus” adalah meme permintaan pinjaman, sama menakutkannya dengan kalimat “kita perlu bicara” dalam hubungan.' },
  { text: 'Kenapa tukang parkir selalu muncul pas kita mau pergi? Karena dia punya radar “prit-prit” bawaan. Wkwk.', why: 'Tukang parkir sering tiba-tiba muncul saat kita mau keluar dan meniup peluit (“prit”) untuk minta bayaran.' },
  { text: 'Diet paling efektif: tanggal tua. Mau makan mikir, mau jajan mikir.', why: 'Saat uang menipis di akhir bulan, kita terpaksa mengurangi makan dan jajan, seolah-olah diet.' },
  { text: 'Aku nggak boros, aku cuma lagi “mendukung UMKM” tiap hari. Termasuk UMKM kopi susu depan kantor.', why: 'Alasan lucu untuk sering jajan: menyebutnya mendukung usaha kecil.' },
  { text: 'Investasi terbaik itu leher: tiap hari nengok saldo, tiap hari kaget. Lehernya jadi kuat.', why: 'Kebiasaan sering mengecek saldo dan kaget diplesetkan menjadi latihan otot leher.' },
  { text: 'Belanja online jam 2 pagi itu bukan boros, itu “self reward” karena berhasil begadang. HAHAHA.', why: 'Mencari alasan untuk belanja tengah malam dengan menyebutnya hadiah untuk diri sendiri.' },
  { text: 'Mau kaya itu gampang: tinggal hapus aplikasi belanja. Masalahnya, susah.', why: 'Saran yang terdengar mudah tapi sulit dilakukan, karena godaan belanja online besar.' },
  { text: 'Uang receh di saku celana yang kecuci itu namanya “tabungan dadakan”. Rezeki anak soleh wkwk.', why: 'Menemukan uang yang terlupa di celana terasa seperti hadiah tak terduga.' },
  { text: 'Kenapa THR cepat habis? Karena dia singkatan dari “Tiba, Habis, Rindu”.', why: 'THR (Tunjangan Hari Raya) diplesetkan jadi “Tiba, Habis, Rindu”: datang, cepat habis, lalu dirindukan.' },
  { text: 'Pas gajian: “Aku pantas dapat ini.” Tiga hari kemudian: “Kenapa aku begini?”', why: 'Menggambarkan rasa puas saat belanja ketika gajian, lalu menyesal beberapa hari kemudian.' },
  { text: 'Kalau dompet bisa ngomong, kalimat pertamanya pasti: “Tolong, aku lelah.” WKWKWK.', why: 'Dompet yang terus-menerus dikuras digambarkan seperti manusia yang kelelahan.' },
  { text: 'Kamu tahu bedanya aku sama ATM? ATM ada saldonya. Aku cuma ada harapan.', why: 'Lelucon mengejek diri sendiri tentang saldo yang kosong.' },
  { text: 'Kamu kayak notifikasi gajian: jarang datang, tapi sekali datang bikin senyum seharian.', why: 'Ini gombalan. Notifikasi gaji masuk jarang (sebulan sekali) tapi membahagiakan.' },
  { text: 'Kalau kamu jadi pengeluaran, aku rela nggak hemat.', why: 'Ini gombalan: rela “boros” untuk orang yang disayang.' },
];

const lines = (v: Voice, l: Partial<Record<Voice, string[]>>) => l[v] || l.santai || [];

export const persona = {
  jokeLead: (v: Voice, turn: number, again: boolean) => pickVar(lines(v, again ? {
    santai: ['Oke, satu lagi:', 'Nih, satu lagi wkwk:', 'Masih kuat ketawa? Nih:'], sopan: ['Baik, satu lagi:', 'Berikut satu lagi:'], singkat: [''], gaul: ['Oke, satu lagi nih:', 'Nih lagi, siapin perut:', 'Gas, satu lagi WKWK:'],
  } : {
    santai: ['', 'Nih, siap-siap ketawa ya:', 'Oke, yang ini receh tapi lucu wkwk:', 'Dengerin ya, jangan ketawa kenceng-kenceng:'], sopan: ['Baik, ini satu lelucon:', 'Berikut satu lelucon:'], singkat: [''], gaul: ['', 'Nih, siap-siap ngakak:', 'Dengerin nih, dijamin ngakak (atau garing) wkwk:', 'Oke bos, satu jokes receh:'],
  }), turn),
  banter: (v: Voice, turn: number, flat: boolean) => pickVar(lines(v, flat ? {
    santai: ['Garing ya? Hehe, nanti aku latihan lawak lagi. Hitunganku tetap nggak garing kok.', 'Krik krik… oke, yang tadi kurang lucu. Mau coba satu lagi?', 'Waduh, garing. Aku tarik kata-kataku deh, hehe.'],
    sopan: ['Mohon maaf kalau leluconnya kurang lucu. Untuk hitungan, saya tetap teliti.', 'Baik, sepertinya yang tadi kurang berhasil. Ingin mencoba satu lagi?'],
    singkat: ['Hehe, garing ya.', 'Oke, kurang lucu.'], gaul: ['Garing ya? Wkwk ntar gue latihan lagi deh.', 'Krik krik… oke, yang tadi gagal. Mau coba lagi?'],
  } : {
    santai: ['Wkwk aku memang receh, tapi hitunganku nggak receh.', 'Wkwkwk aku anggap itu pujian ya.', 'Hahaha makasih udah ketawa. Mau satu lagi?', 'Hehe bisa aja. Ada yang mau dicatat sekalian?', 'Wkwk iya dong, asisten keuangan juga butuh hiburan.'],
    sopan: ['Terima kasih, semoga bisa sedikit menghibur.', 'Senang kalau Anda terhibur. Ada yang bisa saya bantu lagi?'],
    singkat: ['Hehe.', 'Siap.'], gaul: ['WKWK receh mah gue, tapi itungan gue akurat cuy.', 'Anjay, gue anggep pujian nih wkwk.', 'Hehe, mau jokes lagi ga?', 'WKWKWK iya gue emang lucu, baru sadar lo?'],
  }), turn),
  angry: (v: Voice, turn: number) => pickVar(lines(v, {
    santai: ['Maaf ya, aku bikin kesel. Bilang aja bagian mana yang salah, aku perbaiki.', 'Aduh, maaf banget. Aku masih belajar. Kalau aku salah paham, kamu bisa ajari aku.', 'Maaf ya. Coba tulis lagi pelan-pelan, atau ajari aku maksudmu biar nggak salah lagi.'],
    sopan: ['Mohon maaf atas ketidaknyamanannya. Silakan sampaikan bagian yang keliru, saya perbaiki.', 'Mohon maaf. Saya masih belajar. Anda dapat mengajari saya agar tidak keliru lagi.'],
    singkat: ['Maaf. Bagian mana yang salah?', 'Maaf. Ajari aku?'],
    gaul: ['Sori banget bikin kesel. Bilang aja yang salah apa, gue benerin.', 'Waduh, maaf ya. Gue masih belajar. Ajarin gue aja biar ga salah lagi.'],
  }), turn),
  angryRecord: (v: Voice) => v === 'sopan' ? 'Kalau kartunya yang keliru, tulis saja yang benar, misalnya “jadi 45rb” atau “pakai gopay”.' : v === 'gaul' ? 'Kalau kartunya yang salah, tulis aja yang bener, misalnya “jadi 45rb” atau “pake gopay”.' : 'Kalau kartunya yang salah, tulis aja yang benar, misalnya “jadi 45rb” atau “pakai gopay”.',
  apology: (v: Voice, turn: number) => pickVar(lines(v, {
    santai: ['Gapapa kok, aku nggak baper. Lanjut yuk, mau ngapain?', 'Santai aja, udah aku lupain. Ada yang bisa kubantu?', 'Nggak apa-apa. Semua orang bisa kesel. Yuk lanjut.'],
    sopan: ['Tidak apa-apa. Ada yang bisa saya bantu?', 'Tidak masalah sama sekali. Silakan lanjutkan.'],
    singkat: ['Gapapa.', 'Santai.'], gaul: ['Santuy, gue ga baper kok. Lanjut?', 'Udah gue lupain. Mau ngapain nih?'],
  }), turn),
  decline: (v: Voice, turn: number) => pickVar(lines(v, {
    santai: ['Oke, nggak apa-apa. Kabari aja kalau butuh.', 'Siap. Aku di sini kalau perlu.'], sopan: ['Baik. Silakan hubungi saya kapan saja.'], singkat: ['Oke.'], gaul: ['Oke santuy. Panggil aja kalo butuh.'],
  }), turn),
  ackKabar: (v: Voice, turn: number) => pickVar(lines(v, {
    santai: ['Syukurlah! Semoga terus aman ya. Ada yang mau dicatat hari ini?', 'Mantap! Pertahankan ya. Mau cek ringkasan sekalian?'], sopan: ['Syukurlah. Semoga terus aman. Ada yang bisa saya bantu?'], singkat: ['Sip!'], gaul: ['Mantul! Pertahanin ya. Mau nyatet apa nih?'],
  }), turn),
  serious: (v: Voice) => v === 'sopan' ? 'Baik, saya akan menjawab dengan serius dan langsung ke inti.' : v === 'gaul' ? 'Oke, mode serius. Gue jawab to the point.' : v === 'singkat' ? 'Oke, serius.' : 'Oke, mode serius. Aku jawab langsung ke intinya.',
  seriousJoke: (v: Voice) => v === 'sopan' ? 'Satu lelucon singkat, lalu kita kembali serius:' : 'Satu aja ya, abis itu serius lagi:',
  explainNone: (v: Voice) => v === 'sopan' ? 'Bagian mana yang ingin dijelaskan? Silakan tanyakan lebih spesifik.' : v === 'gaul' ? 'Yang mana nih yang mau dijelasin? Tanya lebih spesifik ya.' : 'Maksudnya yang mana? Coba tanya lebih spesifik ya.',
  jokeWhy: (v: Voice, why: string) => v === 'sopan' ? `Lucunya begini: ${why}` : v === 'gaul' ? `Jadi gini: ${why} Wkwk.` : v === 'singkat' ? why : `Lucunya gini: ${why}`,
  // Teaching.
  teachHow: (v: Voice) => v === 'sopan' ? 'Tentu. Tulis seperti ini: “kalau aku bilang boncos artinya boros”. Saya akan mengingatnya di perangkat ini.' : v === 'gaul' ? 'Boleh banget! Tulis gini: “kalau gue bilang boncos artinya boros”. Gue inget di HP lo.' : v === 'singkat' ? 'Tulis: “X artinya Y”.' : 'Boleh banget! Tulis begini: “kalau aku bilang boncos artinya boros”. Nanti kuingat di HP ini.',
  teachAsk: (v: Voice, phrase: string) => v === 'sopan' ? `Maksud “${phrase}” itu apa? Pilih atau tulis dengan kata lain yang saya pahami:` : v === 'gaul' ? `“${phrase}” maksudnya apa? Pilih atau tulis pake kata lain:` : v === 'singkat' ? `“${phrase}” artinya?` : `Maksud “${phrase}” itu apa? Pilih atau tulis dengan kata lain:`,
  teachDone: (v: Voice, phrase: string) => v === 'sopan' ? `Terima kasih, “${phrase}” sekarang saya pahami seperti ini.` : v === 'gaul' ? `Sip, mulai sekarang “${phrase}” gue anggep gini.` : v === 'singkat' ? `“${phrase}” diingat.` : `Siap, mulai sekarang “${phrase}” kuanggap begini.`,
  teachFail: (v: Voice, meaning: string) => v === 'sopan' ? `Mohon maaf, “${meaning}” juga belum saya pahami. Silakan pilih salah satu contoh:` : v === 'gaul' ? `Waduh, “${meaning}” juga gue belum ngerti. Pilih contoh ini aja:` : `Hmm, “${meaning}” juga belum kupahami. Coba pilih salah satu ini:`,
  teachOffer: (v: Voice) => v === 'sopan' ? 'Saya belum memahami beberapa pesan terakhir. Anda dapat mengajari saya: ketuk “Ajari aku”, lalu sampaikan maksudnya.' : v === 'gaul' ? 'Gue belum ngeh beberapa kali nih. Ajarin gue yuk: pencet “Ajari aku”, terus bilang maksudnya.' : v === 'singkat' ? 'Belum paham. Ajari aku?' : 'Aku belum nangkep beberapa kali nih. Mau ajari aku? Ketuk “Ajari aku”, lalu bilang maksudnya.',
  // Offers ("mau …?"): answered with "boleh" / "nggak".
  offerJoke: (v: Voice) => v === 'sopan' ? ' Bila berkenan, saya bisa berbagi satu lelucon untuk menghibur. Mau?' : v === 'gaul' ? ' Kalo mau, gue bisa kasih satu jokes buat ngehibur. Mau?' : v === 'singkat' ? '' : ' Kalau mau, aku bisa kasih satu jokes buat ngehibur. Mau?',
  offerTips: (v: Voice) => v === 'sopan' ? ' Ingin saya berikan tips hemat yang sesuai kondisi Anda?' : v === 'gaul' ? ' Mau gue kasih tips hemat yang pas?' : v === 'singkat' ? '' : ' Mau aku kasih tips hemat yang pas buat kondisimu?',
  offerTeach: (v: Voice) => v === 'sopan' ? ' Ingin mengajari saya agar tidak keliru lagi?' : v === 'gaul' ? ' Mau ajarin gue biar ga salah lagi?' : v === 'singkat' ? '' : ' Mau ajari aku biar nggak salah lagi?',
};

export type CurhatTopic = 'cinta' | 'kerja' | 'kuliah' | 'keluarga' | 'sepi' | 'umum' | 'mulai';
export const CURHAT_TOPICS: [RegExp, CurhatTopic][] = [
  [/\b(?:boleh|mau|pengen|pengin|izin)\s+curhat\b|^curhat(?:\s+(?:dong|dikit|bentar|ya|boleh))*$/u, 'mulai'],
  [/\b(?:pacar|pacarku|putus|diputusin|patah hati|mantan|ditinggal(?:in)?|ninggalin|selingkuh|gebetan|doi|ghosting|di-?ghosting|cinta|nikah|tunangan|suami|istri)\b/u, 'cinta'],
  [/\b(?:kerja|kerjaan|kantor|atasan|bos|lembur|deadline|klien|rekan kerja|resign|gaji telat|dipecat|phk|meeting)\b/u, 'kerja'],
  [/\b(?:kuliah|skripsi|tesis|tugas|dosen|ujian|sekolah|nilai|semester|sidang|revisi|kampus|pr)\b/u, 'kuliah'],
  [/\b(?:ortu|orang tua|orangtua|mama|papa|mamah|papah|ibu|bapak|ayah|bunda|keluarga|adik|adek|kakak|mertua)\b/u, 'keluarga'],
  [/\b(?:sendiri|sendirian|kesepian|sepi|ga punya teman|gak punya teman|nggak punya teman|ga ada yang peduli|gak ada yang peduli|nggak ada yang peduli|dijauhin|dikucilkan)\b/u, 'sepi'],
];
/** Listening: the first reply on a topic, then the later ones (they rotate). */
const CURHAT: Record<CurhatTopic, { first: Partial<Record<Voice, string[]>>; more: Partial<Record<Voice, string[]>> }> = {
  mulai: { first: { santai: ['Boleh banget. Aku dengerin. Cerita aja, semuanya cuma tersimpan di HP-mu.'], sopan: ['Tentu, silakan bercerita. Saya mendengarkan, dan semuanya hanya tersimpan di perangkat Anda.'], singkat: ['Boleh. Cerita aja.'], gaul: ['Boleh banget, gue dengerin. Cerita aja, cuma ada di HP lo kok.'] }, more: { santai: ['Aku dengerin kok. Lanjut aja ceritanya.'] } },
  cinta: {
    first: { santai: ['Peluk dulu ya. Patah hati itu berat, wajar kalau rasanya campur aduk. Mau cerita apa yang terjadi?', 'Duh, pasti nyesek ya. Aku di sini kok. Apa yang paling bikin sedih?'], sopan: ['Saya turut prihatin. Patah hati memang berat. Apakah Anda ingin menceritakannya?'], singkat: ['Turut sedih. Mau cerita?'], gaul: ['Peluk virtual dulu. Patah hati emang berat banget. Mau cerita kenapa?'] },
    more: { santai: ['Pasti sakit banget diperlakukan begitu. Kamu nggak sendirian kok. Pelan-pelan aja, nggak harus langsung baik-baik saja.', 'Perasaanmu valid. Kasih waktu buat dirimu sendiri, dan jangan lupa makan ya.'], sopan: ['Perasaan Anda sangat wajar. Berikan waktu untuk diri sendiri.'], gaul: ['Sakit banget pasti. Lo ga sendirian kok. Pelan-pelan aja ya.'] },
  },
  kerja: {
    first: { santai: ['Kedengarannya capek banget. Kerjaan yang numpuk memang bikin kepala penuh. Bagian mana yang paling berat hari ini?', 'Wah, hari kerja yang berat ya. Mau cerita apa yang terjadi?'], sopan: ['Kedengarannya sangat melelahkan. Bagian mana yang paling berat hari ini?'], singkat: ['Capek ya. Yang paling berat apa?'], gaul: ['Capek banget pasti. Kerjaan numpuk emang bikin mumet. Yang paling bikin pusing apa?'] },
    more: { santai: ['Wajar kalau kesel. Kamu udah berusaha. Coba ambil jeda sebentar: minum air, tarik napas, lalu kerjakan satu hal kecil dulu.', 'Kamu udah kerja keras. Jangan lupa istirahat ya, kerjaan nggak akan habis tapi tenagamu bisa habis.'], sopan: ['Anda sudah berusaha keras. Ambil jeda sejenak, lalu selesaikan satu hal kecil terlebih dahulu.'], gaul: ['Wajar kesel. Lo udah usaha. Ambil napas dulu, kerjain yang kecil-kecil dulu.'] },
  },
  kuliah: {
    first: { santai: ['Tugas dan skripsi memang menguras tenaga. Kamu nggak sendirian. Lagi stuck di bagian apa?'], sopan: ['Urusan kuliah memang menguras tenaga. Sedang terhambat di bagian apa?'], singkat: ['Berat ya. Stuck di mana?'], gaul: ['Skripsi/tugas emang nguras tenaga banget. Stuck di bagian mana?'] },
    more: { santai: ['Coba pecah jadi langkah kecil: satu halaman atau satu bagian dulu. Sedikit tapi jalan tetap maju.', 'Kamu pasti bisa. Kerjakan sedikit-sedikit, dan istirahat juga penting.'], gaul: ['Pecah jadi kecil-kecil aja: satu halaman dulu. Dikit tapi maju.'] },
  },
  keluarga: {
    first: { santai: ['Masalah sama keluarga memang paling kerasa karena dekat di hati. Mau cerita lebih lanjut?'], sopan: ['Masalah keluarga memang sangat terasa. Apakah Anda ingin bercerita lebih lanjut?'], singkat: ['Berat ya. Mau cerita?'], gaul: ['Masalah keluarga emang paling kerasa. Mau cerita lagi?'] },
    more: { santai: ['Kadang orang tua marah karena khawatir, meski caranya bikin sakit. Kalau sudah sama-sama tenang, ngobrol baik-baik bisa membantu.', 'Nggak gampang ya. Kamu boleh sedih. Aku dengerin terus kok.'], gaul: ['Kadang ortu marah karena khawatir, walau caranya nyakitin. Kalo udah adem, coba ngobrol baik-baik.'] },
  },
  sepi: {
    first: { santai: ['Rasa sepi itu nggak enak ya. Aku di sini, boleh cerita apa aja. Hari ini lagi ngapain?'], sopan: ['Rasa sepi memang tidak nyaman. Saya di sini, silakan bercerita.'], singkat: ['Aku di sini. Cerita aja.'], gaul: ['Sepi emang ga enak. Gue di sini kok, cerita aja.'] },
    more: { santai: ['Makasih udah cerita. Coba hubungi satu teman atau keluarga hari ini, walau cuma kirim pesan singkat.'], gaul: ['Makasih udah cerita. Coba chat satu temen hari ini, walau cuma “halo”.'] },
  },
  umum: {
    first: { santai: ['Hari yang berat ya. Makasih udah mau cerita. Apa yang paling bikin kepikiran?', 'Aku dengerin. Nggak apa-apa merasa begitu. Ceritain aja pelan-pelan.'], sopan: ['Terima kasih sudah bercerita. Apa yang paling membebani pikiran Anda?'], singkat: ['Aku dengerin. Ada apa?'], gaul: ['Hari yang berat ya. Makasih udah cerita. Apa yang paling bikin kepikiran?'] },
    more: { santai: ['Aku dengerin kok. Nggak apa-apa merasa begitu. Kalau mau, ceritain lagi pelan-pelan.', 'Kamu udah kuat banget sejauh ini. Jangan lupa istirahat dan makan ya.'], sopan: ['Saya mendengarkan. Tidak apa-apa merasa demikian.'], gaul: ['Gue dengerin kok. Ga papa ngerasa gitu.'] },
  },
};
export function curhatTopic(t: string): CurhatTopic { return CURHAT_TOPICS.find(([re]) => re.test(t))?.[1] || 'umum'; }
export function curhatReply(v: Voice, topic: CurhatTopic, turn: number, later: boolean) {
  const c = CURHAT[topic], pool = later ? c.more : c.first;
  return pickVar(pool[v] || pool.santai || c.first.santai!, turn);
}
/** Words of harm to oneself: answered with care and where to get help, never with jokes. */
export const SELF_HARM = /\b(?:bunuh diri|pengen mati|pingin mati|ingin mati|mau mati aja|mending mati|gak mau hidup|nggak mau hidup|ga mau hidup|tidak mau hidup|ngakhirin hidup|mengakhiri hidup|lukain diri|melukai diri|nyakitin diri|menyakiti diri)\b/u;
export const safety = (v: Voice) => v === 'sopan'
  ? 'Saya ikut sedih Anda merasa sampai seperti ini. Anda penting. Mohon hubungi orang yang Anda percaya sekarang, atau layanan kesehatan jiwa di 119 ekstensi 8. Bila dalam bahaya, segera telepon 112.'
  : 'Aku ikut sedih kamu merasa sampai seperti ini. Kamu penting. Tolong hubungi orang yang kamu percaya sekarang, atau layanan kesehatan jiwa di 119 ekstensi 8. Kalau kamu dalam bahaya, telepon 112 ya.';
