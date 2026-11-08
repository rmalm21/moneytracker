/**
 * 8.8 What kind of place a bank or e-wallet line is about, for imported rows only (Catat otomatis has its own reader).
 *
 * Each entry names places by brand or by the plain word for the kind of place ("apotek", "laundry", "bioskop"), and the
 * category names it usually goes to, most specific first. The person's own categories are searched for those names (a
 * subcategory first, then a main category), so it works with the starter categories and with categories they made
 * themselves ("Kopi" for "Kopi & Minuman", "Belanja Dapur" for groceries).
 */
import type { Category } from '../types';

type Place = { re: RegExp; type: 'expense' | 'income'; names: string[] };
const P = (type: Place['type'], re: RegExp, names: string): Place => ({ type, re, names: names.split('|') });

// Order matters: the first entry that matches wins ("Point Coffee Indomaret" is coffee, not the minimarket).
export const PLACES: Place[] = [
  // Food and drink
  // 8.8 (second round) Everyday words first, where a later, broader word would take them ("Isi ulang galon" is not a drink,
  // "Angkot ke pasar" is not groceries, "Cuci Motor Steam" is not a game, "Servis AC" is not the car).
  P('expense', /\b(?:galon|isi ulang air|air isi ulang)\b/i, 'perlengkapan harian|kebutuhan rumah|rumah & kebutuhan'),
  P('expense', /\b(?:gas lpg|lpg|elpiji|gas melon|gas \d+ ?kg)\b/i, 'gas|tagihan'),
  P('expense', /\b(?:kost|kos|sewa kamar|kontrakan|sewa rumah|uang sewa)\b/i, 'sewa / kost|sewa|kost'),
  P('expense', /\b(?:iuran tahunan kartu|iuran kartu|annual fee|biaya kartu|card fee)\b/i, 'biaya kartu|admin bank|biaya lainnya'),
  P('expense', /\b(?:iuran rt|iuran rw|kas rt|kas rw|iuran warga|iuran lingkungan|uang keamanan|keamanan komplek|ipl|uang sampah|iuran sampah|retribusi sampah|iuran)\b/i, 'iuran|tagihan'),
  P('expense', /\b(?:spp|biaya sekolah|uang sekolah|uang gedung|daftar ulang)\b/i, 'biaya pendidikan|pendidikan'),
  P('expense', /\b(?:ukt|uang kuliah|biaya kuliah|kuliah|semester)\b/i, 'kuliah|pendidikan'),
  P('expense', /\b(?:fotokopi|fotocopy|foto copy|print|cetak dokumen|jilid|laminating)\b/i, 'print / fotokopi|alat tulis|pendidikan'),
  P('expense', /\b(?:dokter gigi|drg|klinik gigi|dental|gigi|behel|orthodont\w*)\b/i, 'gigi|dokter|kesehatan'),
  P('expense', /\b(?:optik|kacamata|lensa kontak|softlens)\b/i, 'mata|kesehatan'),
  P('expense', /\b(?:samsat|stnk|bpkb|pajak motor|pajak mobil|pajak kendaraan)\b/i, 'pajak kendaraan|kendaraan'),
  P('expense', /\b(?:cuci motor|cuci mobil|car ?wash|steam motor|steam mobil|clean wash|cuci salju|snow wash)\b/i, 'cuci kendaraan|kendaraan'),
  P('expense', /\b(?:ganti oli|oli mesin|oli|pelumas)\b/i, 'oli|kendaraan'),
  P('expense', /\b(?:tambal ban|ganti ban|ban mobil|ban motor|ban dalam|ban luar|planet ban)\b/i, 'ban|kendaraan'),
  P('expense', /\b(?:servis ac|service ac|cuci ac|perbaikan rumah|renovasi|tukang|ledeng|pipa bocor|bocor)\b/i, 'perbaikan rumah|kebutuhan rumah|rumah & kebutuhan'),
  P('expense', /\b(?:kondangan|nikahan|pernikahan|undangan nikah|resepsi|kawinan)\b/i, 'pernikahan|acara|sosial'),
  P('expense', /\b(?:kado|ulang tahun|ultah)\b/i, 'ulang tahun|hadiah'),
  P('expense', /\b(?:arisan)\b/i, 'arisan|keluarga|sosial & sedekah|sosial'),
  P('expense', /\b(?:deterjen|detergen|rinso|so klin|sabun cuci|pembersih|pewangi|pengharum|softener|kain pel|sapu)\b/i, 'kebersihan|perlengkapan harian|kebutuhan rumah'),
  P('expense', /\b(?:sabun|shampoo|sampo|pasta gigi|odol|tisu|tissue|popok|pampers|pembalut)\b/i, 'perlengkapan harian|personal care|kebutuhan rumah'),
  P('expense', /\b(?:sewa mobil|rental mobil|sewa motor|rental motor|rent car)\b/i, 'sewa kendaraan|transportasi'),
  P('expense', /\b(?:kereta api|tiket kereta|tiket ka|argo \w+|kai access)\b/i, 'kereta|tiket kereta|transportasi umum|transportasi'),
  P('expense', /\b(?:kapal|ferry|feri|speedboat|asdp|pelni|penyeberangan)\b/i, 'kapal|transportasi'),
  P('expense', /\b(?:angkot|angkutan umum|bus|bis kota|damri|transjakarta|ojek pangkalan)\b/i, 'transportasi umum|transportasi'),
  P('expense', /\b(?:snack|camilan|cemilan|jajan|cilok|cireng|keripik|kerupuk)\b/i, 'jajan|makan & minum'),
  P('expense', /\b(?:majalah|koran|langganan berita|tempo|kompas\.id|substack|medium)\b/i, 'berita / konten|langganan'),
  P('expense', /\b(?:parfum|perfume|makeup|make up|kosmetik)\b/i, 'personal care|perawatan diri|skincare'),
  P('expense', /\b(?:wardah|serum|sunscreen|skin ?care|facial wash|toner)\b/i, 'skincare|personal care|perawatan diri'),
  P('expense', /\b(?:sepatu|sneakers|shoes)\b/i, 'sepatu|belanja'),
  P('expense', /\b(?:charger|kabel data|power ?bank|casing hp|case hp)\b/i, 'elektronik|gadget|belanja'),
  P('expense', /\b(?:tiket masuk|dufan|taman bermain|wahana|kebun binatang)\b/i, 'tiket hiburan|tiket wisata|hiburan'),
  P('expense', /\b(?:karaoke|inul vizta|happy puppy|billiard|biliar)\b/i, 'aktivitas|nongkrong|hiburan'),
  P('expense', /\b(?:oleh-oleh|oleh oleh)\b/i, 'oleh-oleh|travel'),
  P('expense', /\b(?:visa|paspor|imigrasi)\b/i, 'dokumen|travel'),
  P('expense', /\b(?:denda|keterlambatan|late fee|late charge)\b/i, 'denda|biaya lainnya'),
  P('expense', /\b(?:biaya tarik tunai|biaya atm|tarik tunai atm bersama|atm bersama|prima)\b/i, 'biaya tarik tunai|admin bank|biaya lainnya'),
  P('expense', /\b(?:go-?food|grab ?food|shopee ?food|pesan antar|food delivery)\b/i, 'delivery|pesan antar|makan online|makan & minum|makan'),
  P('expense', /\b(?:kopi|coffee|cafe|kafe|starbucks|sbux|janji jiwa|kopi kenangan|fore|tomoro|chatime|gong ?cha|xing fu tang|kopi kulo|excelso|flash coffee|point coffee|haus|mixue|boba|teh|tea|minuman|juice|jus)\b/i, 'kopi & minuman|kopi|minuman|ngopi|cafe|makan & minum'),
  // Groceries after drinks: "Kopi susu gula aren" is a coffee, "Gula dan tepung" is shopping for the kitchen.
  P('expense', /\b(?:beras|telur|minyak goreng|gula|tepung|sembako|bumbu dapur|daging|ikan segar)\b/i, 'bahan makanan|belanja dapur|groceries|kebutuhan dapur'),
  P('expense', /(?:\b(?:kfc|mcdonald'?s?|mcd|burger king|pizza hut|domino'?s?|wendy'?s|richeese|texas chicken|fast food|burger|pizza)\b|\ba&w\b|\ba ?& ?w\b)/i, 'fast food|makan siang|makan & minum|makan'),
  P('expense', /\b(?:superindo|super indo|hypermart|transmart|carrefour|lotte ?mart|ranch market|giant|hero|farmers market|grand lucky|aeon|yogya|tip top|supermarket|swalayan|hypermarket|pasar|buah|sayur)\b/i, 'bahan makanan|belanja dapur|groceries|belanja bulanan|kebutuhan dapur|makan & minum'),
  P('expense', /\b(?:indomaret|alfamart|alfamidi|alfa express|lawson|circle ?k|family ?mart|7-eleven|minimarket|mini market)\b/i, 'perlengkapan harian|kebutuhan harian|kebutuhan rumah|belanja harian|belanja bulanan|belanja kebutuhan|rumah & kebutuhan|belanja dapur|belanja'),
  P('expense', /\b(?:warteg|warung makan|rumah makan|resto|restoran|restaurant|padang|bakso|sate|soto|mie|mi ayam|ayam|nasi|sushi|ramen|martabak|seafood|hokben|solaria|gacoan|mixue|es krim|ice cream|bakery|roti|kue|warung tegal|warung nasi|chicken|crispy|geprek|seblak|cimol|siomay|batagor|gado|pecel|lalapan|gorengan|pempek|dimsum|kebab|bubur|kantin|catering|katering|noodle|rice bowl|makan)\b/i, 'restoran|makan siang|makan|makan & minum|jajan'),
  // Getting around
  P('expense', /\b(?:go-?ride|grab ?bike|maxim|ojek|ojol)\b/i, 'ojek|taxi / online|transportasi online|ojol|transportasi'),
  P('expense', /\b(?:go-?car|grab ?car|bluebird|blue bird|taxi|taksi)\b/i, 'taxi / online|taksi|transportasi online|transportasi'),
  P('expense', /\b(?:go-?send|grab ?express|lalamove|paxel|jne|j&t|sicepat|anteraja|kurir|ongkir|pengiriman)\b/i, 'kirim barang|pengiriman|ongkir|transportasi'),
  P('expense', /\b(?:grab|gojek)\b/i, 'transportasi online|taxi / online|ojek|transportasi'),
  P('expense', /\b(?:pertamina|spbu|shell|bp akr|vivo energy|bensin|bbm|pertalite|pertamax)\b/i, 'bensin|bbm|transportasi'),
  P('expense', /\b(?:parkir|parking)\b/i, 'parkir|transportasi'),
  P('expense', /\b(?:e-?toll|tol|jasa marga|flazz|brizzi|tapcash)\b/i, 'tol|e-toll|transportasi'),
  P('expense', /\b(?:krl|commuter|mrt|lrt|transjakarta|whoosh|damri|bus|angkot|kereta|kai)\b/i, 'transportasi umum|kereta|transportasi'),
  // Bills
  P('expense', /\b(?:pln|token listrik|listrik)\b/i, 'listrik|tagihan'),
  P('expense', /\b(?:pdam|palyja|aetra|tagihan air|air minum)\b/i, 'air|tagihan'),
  P('expense', /\b(?:paket data|paket internet|kuota|data \d+ ?gb)\b/i, 'paket data|kuota|pulsa|internet|tagihan'),
  P('expense', /\b(?:pulsa)\b/i, 'pulsa|tagihan'),
  P('expense', /\b(?:indihome|biznet|first media|myrepublic|iconnet|wifi|internet)\b/i, 'internet|wifi|tagihan'),
  P('expense', /\b(?:bpjs)\b/i, 'bpjs|iuran|asuransi|tagihan'),
  P('expense', /\b(?:asuransi|premi|prudential|allianz|axa|manulife|aia)\b/i, 'asuransi|tagihan'),
  // Subscriptions
  P('expense', /\b(?:netflix|disney\+?|hotstar|vidio|prime video|viu|wetv|iqiyi|hbo|streaming)\b/i, 'film & streaming|streaming|langganan'),
  P('expense', /\b(?:spotify|joox|apple music|youtube music|musik|music)\b/i, 'musik|langganan'),
  P('expense', /\b(?:youtube premium|youtube)\b/i, 'film & streaming|langganan'),
  P('expense', /\b(?:google one|icloud|onedrive|dropbox|cloud storage|google storage)\b/i, 'cloud storage|langganan'),
  P('expense', /\b(?:openai|chatgpt|claude|anthropic|midjourney|github|notion|adobe|canva|figma|microsoft 365|office 365)\b/i, 'ai / software|software|aplikasi|langganan'),
  P('expense', /\b(?:apple\.com|app store)\b/i, 'aplikasi|langganan'),
  // Shopping
  P('expense', /\b(?:tokopedia|shopee|lazada|bukalapak|blibli|tiktok shop|marketplace|belanja online)\b/i, 'marketplace|belanja online|belanja'),
  P('expense', /(?:\b(?:uniqlo|zara|matahari|zalora|cotton ink|erigo|pull ?& ?bear|bershka|nike|adidas|pakaian|baju|kaos|fashion)\b|\bh ?& ?m\b)/i, 'pakaian|fashion|belanja'),
  P('expense', /\b(?:erafone|ibox|digimap|electronic city|samsung|xiaomi|best denki|gadget|elektronik|handphone|hp)\b/i, 'gadget|elektronik|belanja'),
  P('expense', /\b(?:guardian|watsons|sociolla|the body shop|skincare|kosmetik|personal care)\b/i, 'personal care|skincare|perawatan diri|belanja'),
  P('expense', /\b(?:ikea|ace hardware|informa|mr diy|mitra10|depo bangunan|perabot|furnitur|furniture|furnishing)\b/i, 'kebutuhan rumah|perlengkapan rumah|furnitur|rumah & kebutuhan|rumah'),
  // Health
  P('expense', /\b(?:apotek|apotik|k-?24|kimia farma|century|farma|obat)\b/i, 'obat|apotek|kesehatan'),
  P('expense', /\b(?:laboratorium|lab klinik|prodia|pramita)\b/i, 'laboratorium|kesehatan'),
  P('expense', /\b(?:klinik|dokter|rumah sakit|rs|hospital|siloam|hermina|mitra keluarga|halodoc|alodokter)\b/i, 'dokter|kesehatan'),
  P('expense', /\b(?:fitness|gym|fit hub)\b/i, 'gym|fitness|olahraga|kesehatan'),
  // Fun, travel, learning, giving
  P('expense', /\b(?:xxi|cgv|cinepolis|bioskop|cinema)\b/i, 'bioskop|nonton|hiburan'),
  P('expense', /\b(?:steam(?:powered| purchase| games?| wallet)|mobile legends|playstation|nintendo|garena|codashop|unipin|timezone|game|gaming)\b/i, 'gaming|game|hiburan'),
  P('expense', /\b(?:konser|tix id|loket|tiket konser)\b/i, 'konser|tiket hiburan|hiburan'),
  P('expense', /\b(?:hotel|penginapan|resort|airbnb|agoda|booking\.com|oyo|reddoorz|traveloka hotel)\b/i, 'hotel|penginapan|travel'),
  P('expense', /\b(?:pesawat|garuda|lion air|citilink|airasia|batik air|super air jet|pelita air|flight)\b/i, 'tiket pesawat|pesawat|travel'),
  P('expense', /\b(?:gramedia|periplus|togamas|toko buku|bookstore|buku)\b/i, 'buku|pendidikan'),
  P('expense', /\b(?:udemy|coursera|ruangguru|zenius|dicoding|kursus|course|kelas online|les)\b/i, 'kursus|kelas online|pendidikan'),
  P('expense', /\b(?:kitabisa|donasi|donation)\b/i, 'donasi|sedekah|sosial'),
  P('expense', /\b(?:zakat|baznas|dompet dhuafa|infaq|infak|sedekah|masjid|gereja|rumah zakat|lazismu)\b/i, 'sedekah|zakat|keagamaan|donasi'),
  // Home and personal
  P('expense', /\b(?:laundry|binatu|klin)\b/i, 'laundry|kebutuhan rumah'),
  P('expense', /\b(?:barbershop|barber|pangkas|potong rambut|cukur|salon|johnny andrean)\b/i, 'potong rambut|salon|perawatan diri|personal'),
  P('expense', /\b(?:ahass|bengkel|service motor|servis motor|service mobil|servis)\b/i, 'service|servis|kendaraan'),
  // Bank charges
  P('expense', /\b(?:pajak bunga|pajak atas bunga|tax on interest|pph bunga)\b/i, 'pajak|biaya lainnya'),
  P('expense', /\b(?:biaya transfer|biaya trf|transfer fee|biaya bi-?fast)\b/i, 'biaya transfer|admin bank|biaya lainnya'),
  P('expense', /\b(?:biaya adm(?:in(?:istrasi)?)?|monthly fee|admin fee|biaya bulanan)\b/i, 'admin bank|biaya admin|biaya lainnya'),
  // Money in
  // Cashback first: "Cashback Bonus" is a reward from the bank, not a work bonus.
  P('income', /\b(?:cashback|reward|poin|points|promo)\b/i, 'cashback|reward|penghasilan keuangan'),
  P('income', /\b(?:gaji|payroll|salary)\b/i, 'gaji bulanan|gaji'),
  P('income', /\b(?:bonus)\b/i, 'bonus|gaji'),
  P('income', /\b(?:lembur|overtime)\b/i, 'lembur|gaji'),
  P('income', /\b(?:reimburse\w*|klaim kantor|claim kantor)\b/i, 'reimbursement|claim kantor|reimburse lainnya'),
  P('income', /\b(?:hadiah|undian|lomba|giveaway)\b/i, 'hadiah uang|penghasilan tambahan'),
  P('income', /\b(?:thr|tunjangan)\b/i, 'tunjangan|bonus|gaji'),
  P('income', /\b(?:insentif|incentive|komisi|commission)\b/i, 'insentif|komisi|gaji'),
  P('income', /\b(?:bunga|interest|jasa giro)\b/i, 'bunga|penghasilan keuangan'),
  P('income', /\b(?:dividen|dividend)\b/i, 'dividen|hasil investasi|penghasilan keuangan'),
  P('income', /\b(?:refund|pengembalian dana|pengembalian uang)\b/i, 'pengembalian uang|refund|uang kembali'),
  P('income', /\b(?:penjualan|seller|hasil jual)\b/i, 'penjualan|penghasilan tambahan'),
  P('income', /\b(?:freelance|honor|honorarium|fee)\b/i, 'freelance|jasa|penghasilan tambahan'),
];

const norm = (s: string) => s.toLowerCase().replace(/\p{Extended_Pictographic}/gu, '').replace(/\bdan\b/g, '&').replace(/[^\p{L}\p{N}&/ ]+/gu, ' ').replace(/\s+/g, ' ').trim();
const hasWords = (outer: string, inner: string) => ` ${outer} `.includes(` ${inner} `);

/** The person's category for a kind of place: an exact name first, then a name containing the words (subcategories first). */
export function categoryByNames(names: string[], type: 'expense' | 'income', categories: Category[]): { categoryId: string; subcategoryId: string | null } | null {
  const live = categories.filter(c => !c.isArchived && c.type === type);
  const pick = (c: Category) => c.parentId && live.some(p => p.id === c.parentId) ? { categoryId: c.parentId, subcategoryId: c.id } : { categoryId: c.id, subcategoryId: null };
  for (const wanted of names.map(norm)) {
    const exact = live.filter(c => norm(c.name) === wanted).sort((a, b) => Number(Boolean(b.parentId)) - Number(Boolean(a.parentId)))[0];
    if (exact) return pick(exact);
    // "Kopi" for "kopi & minuman", "Belanja Dapur" for "belanja dapur" inside a longer name; words, not letters.
    const loose = live.filter(c => { const n = norm(c.name); return n.length >= 3 && (hasWords(wanted, n) || hasWords(n, wanted)); }).sort((a, b) => Number(Boolean(b.parentId)) - Number(Boolean(a.parentId)) || norm(a.name).length - norm(b.name).length)[0];
    if (loose) return pick(loose);
  }
  return null;
}

/** The category for a statement line from what kind of place it names, or nothing when no entry fits. */
export function placeCategory(text: string, type: 'expense' | 'income', categories: Category[]) {
  for (const place of PLACES) if (place.type === type && place.re.test(text)) { const hit = categoryByNames(place.names, type, categories); if (hit) return hit; }
  return null;
}
