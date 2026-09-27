/**
 * Reading what a spending or income sentence is about, to pick the right category of the person's own, and to tell
 * whether money goes out or comes in.
 *
 * Evidence is added up per category:
 *  - Context words. An ambiguous word is read with the words around it, the amount and the place: "beli air 5rb di alfa"
 *    is a drink, "bayar air 150rb" / "air pdam" is the water bill; "tiket kereta" is transport, "tiket konser" is fun;
 *    "grab" is a ride but "grabfood" is food; "ayam goreng" is a meal, "ayam 1 kg" is groceries.
 *  - The person's own habits: earlier transactions with the same item, at the same place, or with the same words.
 *  - A category named in the sentence.
 * The words point to concepts (minuman, tagihan air, bensin…). A concept finds its category among the person's own by the
 * category's name, the template it was made from and its icon, so "Makan & Minum", "Kopi & Minuman" or a renamed template
 * category all work, and a subcategory is chosen when it fits better than its main category. Nothing is created here.
 */
import type { Category, LedgerTx } from './types';

type Flow = 'expense' | 'income';
type ConceptDef = { id: string; type: Flow; parent?: string; label: string; names: string[]; icons: string };
/** id, type, parent, how it's called in a reason, words in category names (a leading "~" = weak), typical icons. */
const C = (id: string, type: Flow, parent: string, label: string, names: string, icons = ''): ConceptDef => ({ id, type, parent: parent || undefined, label, names: names.split('|'), icons });
const CONCEPTS: ConceptDef[] = [
  C('food', 'expense', '', 'makanan', 'makan|makanan|kuliner|konsumsi|food|resto|restoran|fast food|dining', '🍜🍱🍽️🍔🍕🍗🥡🍝🍛🍲'),
  C('breakfast', 'expense', 'food', 'sarapan', 'sarapan|breakfast|makan pagi', '🥐🍳'),
  C('lunch', 'expense', 'food', 'makan siang', 'makan siang|lunch|maksi', '🍱'),
  C('dinner', 'expense', 'food', 'makan malam', 'makan malam|dinner', '🌙'),
  C('snack', 'expense', 'food', 'jajanan', 'jajan|jajanan|camilan|cemilan|snack|ngemil', '🍿🍩🍪🍫'),
  C('drink', 'expense', 'food', 'minuman', 'minum|minuman|drink|drinks|beverage|air minum|air mineral|galon|jus|juice', '🥤🧃🧋🍹'),
  C('coffee', 'expense', 'drink', 'kopi', 'kopi|coffee|ngopi|cafe|kafe', '☕'),
  C('delivery', 'expense', 'food', 'pesan antar', 'delivery|pesan antar|gofood|grabfood|shopeefood|online food', '🥡🛵'),
  C('groceries', 'expense', 'food', 'bahan makanan', 'bahan makanan|bahan masakan|belanja dapur|groceries|grocery|sembako|belanja bulanan|kebutuhan pokok|pasar|sayur|sayuran', '🛒🥬🥕'),
  C('transport', 'expense', '', 'transportasi', 'transport|transportasi|perjalanan|mobilitas|ongkos jalan', '🚗🚙'),
  C('fuel', 'expense', 'transport', 'bensin', 'bensin|bbm|fuel|pertalite|pertamax|solar', '⛽'),
  C('parking', 'expense', 'transport', 'parkir', 'parkir|parking', '🅿️'),
  C('toll', 'expense', 'transport', 'tol', 'tol|toll|e-toll|etoll', '🛣️'),
  C('ride', 'expense', 'transport', 'ojek / taksi online', 'ride hailing|transportasi online|taxi / online|taksi / online|taxi online|taksi online|ojek online|grab|gojek|maxim', ''),
  C('ojek', 'expense', 'ride', 'ojek', 'ojek|ojol|ojek online', '🛵'),
  C('taxi', 'expense', 'ride', 'taksi', 'taxi|taksi|taxi online|taksi online', '🚕'),
  C('public', 'expense', 'transport', 'transportasi umum', 'transportasi umum|angkutan umum|bus|busway|transjakarta|angkot|krl|mrt|lrt|commuter', '🚌🚇'),
  C('train', 'expense', 'transport', 'kereta', 'kereta|kereta api|tiket kereta|train', '🚆🚄'),
  C('ship', 'expense', 'transport', 'kapal', 'kapal|ferry|feri|pelabuhan', '🚢⛴️'),
  C('rental', 'expense', 'transport', 'sewa kendaraan', 'sewa kendaraan|rental|sewa mobil|sewa motor', ''),
  C('vehicle', 'expense', 'transport', 'kendaraan', 'kendaraan|perbaikan|perawatan kendaraan|aksesori kendaraan|motor|mobil', '🔧'),
  C('vehicle_service', 'expense', 'vehicle', 'servis kendaraan', 'service|servis|bengkel|tune up', '🛠️'),
  C('vehicle_parts', 'expense', 'vehicle', 'suku cadang', 'spare part|sparepart|onderdil|aki|ban|oli', '🛞🔩🧴'),
  C('vehicle_wash', 'expense', 'vehicle', 'cuci kendaraan', 'cuci kendaraan|cuci motor|cuci mobil|salon mobil', '🚿'),
  C('vehicle_tax', 'expense', 'vehicle', 'pajak kendaraan', 'pajak kendaraan|stnk|samsat|pajak motor|pajak mobil', ''),
  C('bills', 'expense', '', 'tagihan', 'tagihan|utilitas|bills|bill|~bulanan', '💡🧾'),
  C('electricity', 'expense', 'bills', 'listrik', 'listrik|pln|token listrik|electricity', '⚡🔌'),
  C('water', 'expense', 'bills', 'tagihan air', 'air|pdam|tagihan air|air pdam|water', '💧🚰'),
  C('internet', 'expense', 'bills', 'internet', 'internet|wifi|indihome|broadband', '🌐📶'),
  C('phone', 'expense', 'bills', 'pulsa', 'pulsa|telepon|telpon|komunikasi|phone', '📱'),
  C('mobile_data', 'expense', 'phone', 'paket data', 'paket data|kuota|data|internet hp', '📶'),
  C('gas', 'expense', 'bills', 'gas', 'gas|elpiji|lpg', '🔥'),
  C('housing', 'expense', 'bills', 'sewa / kost', 'sewa|kost|kos|kontrakan|kpr|cicilan rumah|sewa rumah|apartemen|ipl|hunian|tempat tinggal', '🏠🏡'),
  C('insurance', 'expense', 'bills', 'asuransi', 'asuransi|premi|bpjs|insurance', '🛡️'),
  C('dues', 'expense', 'bills', 'iuran', 'iuran|kas rt|keamanan|kebersihan lingkungan|sampah', ''),
  C('installment', 'expense', 'bills', 'cicilan', 'cicilan|angsuran|kredit|paylater|pinjaman', ''),
  C('shopping', 'expense', '', 'belanja', 'belanja|shopping|marketplace|olshop|online shop|belanja online|belanja lainnya', '🛍️'),
  C('household', 'expense', '', 'kebutuhan rumah', 'rumah|rumah tangga|kebutuhan rumah|perlengkapan rumah|perlengkapan harian|kebutuhan harian|peralatan|peralatan dapur|perabot|household|home', '🧹🧻🪣'),
  C('cleaning', 'expense', 'household', 'kebersihan', 'kebersihan|sabun|detergen|deterjen|cleaning', '🧼🧽'),
  C('laundry', 'expense', 'household', 'laundry', 'laundry|londri|cuci baju|cuci setrika', '🧺'),
  C('furniture', 'expense', 'household', 'perabot', 'furnitur|furniture|perabot|mebel|perlengkapan kamar', '🪑🛏️🛋️'),
  C('home_repair', 'expense', 'household', 'perbaikan rumah', 'perbaikan rumah|renovasi|tukang|servis rumah', '🔨'),
  C('helper', 'expense', 'household', 'asisten rumah tangga', 'art|asisten rumah tangga|pembantu|asisten|gaji art|pengasuh|babysitter|sopir|supir', ''),
  C('clothing', 'expense', 'shopping', 'pakaian', 'pakaian|baju|fashion|busana|outfit', '👕👗'),
  C('shoes', 'expense', 'clothing', 'sepatu', 'sepatu|sandal|sendal|sneakers|alas kaki', '👟'),
  C('accessories', 'expense', 'clothing', 'aksesori', 'aksesori|aksesoris|tas|jam tangan|perhiasan', '⌚👜'),
  C('gadget', 'expense', 'shopping', 'elektronik', 'elektronik|gadget|hp|handphone|laptop|komputer|perangkat', '💻📱🎧'),
  C('shipping', 'expense', 'shopping', 'ongkos kirim', 'ongkir|ongkos kirim|pengiriman|kirim paket|ekspedisi|kurir|shipping', '📦'),
  C('hobby', 'expense', 'shopping', 'hobi', 'hobi|hobby|mainan|koleksi', '🧸🎨'),
  C('personal', 'expense', '', 'perawatan diri', 'personal|perawatan|perawatan diri|personal care|kecantikan|beauty|self care|grooming', '👤'),
  C('haircut', 'expense', 'personal', 'potong rambut', 'potong rambut|cukur|barbershop|barber|salon|rambut', '💈'),
  C('skincare', 'expense', 'personal', 'perawatan diri', 'skincare|kosmetik|makeup|make up|perawatan wajah|toiletries|personal care', '🧴💄'),
  C('health', 'expense', '', 'kesehatan', 'kesehatan|medis|medical|health|sehat', '❤️🏥'),
  C('doctor', 'expense', 'health', 'dokter', 'dokter|klinik|rumah sakit|rs|periksa|medical check up|check up|laboratorium|lab|gigi|mata|konsultasi', '🏥🩺🦷👓🧪'),
  C('medicine', 'expense', 'health', 'obat', 'obat|apotek|apotik|vitamin|suplemen|farmasi', '💊'),
  C('fitness', 'expense', 'health', 'olahraga', 'gym|fitness|olahraga|sport|wellness|yoga', '🏋️🧘'),
  C('entertainment', 'expense', '', 'hiburan', 'hiburan|nongkrong|rekreasi|hangout|entertainment|fun|healing|jalan-jalan|main', '🎉🎈'),
  C('movies', 'expense', 'entertainment', 'nonton film', 'bioskop|film|cinema|nonton', '🎬'),
  C('events', 'expense', 'entertainment', 'acara & tiket', 'konser|acara|event|tiket hiburan|tiket wisata|wisata|aktivitas|festival', '🎤🎟️🎳'),
  C('games', 'expense', 'entertainment', 'game', 'game|games|gaming|top up game|topup game', '🎮'),
  C('subscription', 'expense', 'entertainment', 'langganan', 'langganan|subscription|membership|streaming|aplikasi|software|cloud|premium', '🔁☁️🤖'),
  C('streaming', 'expense', 'subscription', 'film & streaming', 'film & streaming|film streaming|streaming|video', '🎬'),
  C('music', 'expense', 'subscription', 'musik', 'musik|music', '🎵'),
  C('education', 'expense', '', 'pendidikan', 'pendidikan|sekolah|kuliah|kursus|les|belajar|education|kampus|spp|ukt|kelas|pelatihan|training|sertifikasi|biaya pendidikan', '🎓🎒📝'),
  C('books', 'expense', 'education', 'buku', 'buku|books|bacaan', '📚📖'),
  C('stationery', 'expense', 'education', 'alat tulis', 'alat tulis|atk|print|fotokopi|fotocopy|cetak', '✏️🖨️'),
  C('social', 'expense', '', 'sosial', 'sosial|acara|arisan|teman|bantuan teman', '🤝💐'),
  C('wedding', 'expense', 'social', 'kondangan', 'kondangan|pernikahan|nikahan|resepsi', '💍'),
  C('birthday', 'expense', 'social', 'ulang tahun', 'ulang tahun|ultah|birthday', '🎂'),
  C('charity', 'expense', 'social', 'sedekah', 'sedekah|donasi|zakat|infak|infaq|amal|sumbangan|wakaf|perpuluhan|kolekte|persembahan|keagamaan|ibadah', '🤲💝🕌'),
  C('gift', 'expense', 'social', 'hadiah', 'hadiah|kado|gift', '🎁'),
  C('family', 'expense', '', 'keluarga', 'keluarga|anak|bayi|orang tua|ortu|istri|suami|family|kids', '👨‍👩‍👧'),
  C('pets', 'expense', '', 'hewan peliharaan', 'hewan|peliharaan|kucing|anjing|pet|pets', '🐶🐱'),
  C('work', 'expense', '', 'kerja', 'kerja|kantor|operasional|dinas|work', '💼'),
  C('travel', 'expense', '', 'liburan', 'travel|liburan|wisata|holiday|vacation|trip|hotel|penginapan|perjalanan', '✈️🏖️🧳'),
  C('flight', 'expense', 'transport', 'tiket pesawat', 'pesawat|tiket pesawat|flight|penerbangan', '✈️'),
  C('hotel', 'expense', 'travel', 'hotel', 'hotel|penginapan|akomodasi|villa|homestay', '🏨'),
  C('souvenir', 'expense', 'travel', 'oleh-oleh', 'oleh-oleh|oleh oleh|souvenir|cenderamata', ''),
  C('fees', 'expense', '', 'biaya', 'biaya|admin|biaya admin|admin bank|biaya transfer|biaya kartu|fee|charge|denda|biaya keuangan', '💸🏦'),
  C('tax', 'expense', 'fees', 'pajak', 'pajak|pbb|pph|tax', ''),
  C('other', 'expense', '', 'lainnya', 'lainnya|lain-lain|lain lain|other|others|tak terduga|belum dikategorikan|misc', '📦❓'),
  C('salary', 'income', '', 'gaji', 'gaji|salary|payroll|upah|gaji bulanan|gaji pokok|penghasilan utama', '💼💰'),
  C('overtime', 'income', 'salary', 'lembur', 'lembur|overtime', '⏱️'),
  C('bonus', 'income', 'salary', 'bonus', 'bonus|insentif|rapel|incentive', '🎯🏆'),
  C('allowance', 'income', 'bonus', 'tunjangan / THR', 'tunjangan|thr|tunjangan hari raya', '💵'),
  C('side', 'income', '', 'penghasilan tambahan', 'penghasilan tambahan|tambahan|sampingan|side|side project|usaha|bisnis', '💰'),
  C('freelance', 'income', 'side', 'freelance', 'freelance|proyek|project|jasa|honor|honorarium|klien|client', '💻🎨'),
  C('sales', 'income', 'side', 'penjualan', 'penjualan|jualan|dagang|dagangan|toko|olshop|omzet|jual', '🛍️'),
  C('commission', 'income', 'side', 'komisi', 'komisi|affiliate|afiliasi|referral|fee', '💵'),
  C('gift_in', 'income', '', 'hadiah', 'hadiah|hadiah uang|angpao|angpau|pemberian|kiriman|uang saku|warisan|gift', '🎁🧧'),
  C('finance_in', 'income', '', 'hasil keuangan', 'keuangan|penghasilan keuangan|investasi|hasil investasi|imbal hasil|pasif|passive', '🏦📈'),
  C('interest', 'income', 'finance_in', 'bunga', 'bunga|interest|deposito', ''),
  C('dividend', 'income', 'finance_in', 'hasil investasi', 'dividen|dividend|saham|reksadana|reksa dana|hasil investasi|capital gain', '📈'),
  C('cashback', 'income', 'finance_in', 'cashback', 'cashback|cash back|reward|poin|points|koin', '🎁🏆'),
  C('returned', 'income', '', 'uang kembali', 'uang kembali|uang kembali dari orang|kembali', '👥'),
  C('refund', 'income', 'returned', 'pengembalian dana', 'pengembalian|pengembalian uang|pengembalian dana|refund', '💵'),
  C('split', 'income', 'returned', 'patungan', 'patungan|urunan|split bill', '👥'),
  C('reimbursement', 'income', '', 'reimbursement', 'reimbursement|reimburse|klaim|claim|penggantian', '🧾'),
  C('rent_in', 'income', '', 'sewa', 'sewa|kos|kost|kontrakan|properti', '🏠'),
  C('other_in', 'income', '', 'lainnya', 'lainnya|lain-lain|pemasukan lainnya|other|belum dikategorikan|arisan', '💵'),
];
const conceptById = new Map(CONCEPTS.map(c => [c.id, c]));
const lineage = (id: string) => { const out: string[] = []; for (let c = conceptById.get(id); c; c = c.parent ? conceptById.get(c.parent) : undefined) out.push(c.id); return out; };
const LINEAGE = new Map(CONCEPTS.map(c => [c.id, lineage(c.id)]));
const related = (a: string, b: string) => LINEAGE.get(a)!.includes(b) || LINEAGE.get(b)!.includes(a);

/** A word or phrase read from the text, how strongly, and the context that makes that reading likelier or unlikelier. */
/** plus: +2, hint: +1, minus: −2.5, veto: not this reading; an amount outside min–max: −1.5; at most `cheap` or at least `big`: +1. */
type Rule = { match: RegExp; concept: string; weight: number; plus?: RegExp; hint?: RegExp; minus?: RegExp; veto?: RegExp; min?: number; max?: number; cheap?: number; big?: number };
const R = (match: RegExp, concept: string, weight: number, more: Omit<Rule, 'match' | 'concept' | 'weight'> = {}): Rule => ({ match, concept, weight, ...more });

// Context around ambiguous words.
const WATER_BILL = /\b(pdam|tagihan|rekening air|meteran|abonemen|iuran)\b/;
const DRINKING = /\b(minum|mineral|putih|galon|botol|gelas|aqua|dingin|es|haus|seger|segar|kemasan|isi ulang|dus|kardus)\b/;
const SHOPS = /\b(beli|alfa|alfamart|alfamidi|indomaret|indo|warung|toko|kantin|minimarket|supermarket|lawson|circle k|family ?mart)\b/;
/** "air" that is neither a drink nor the water bill: an airline, a pump, a fryer, a fountain… */
const NOT_WATER = /\b(batik air|lion air|air ?asia|pelita air|super air jet|pompa air|cat air|air conditioner|air mancur|air fryer|airfryer|air purifier|kolam|air panas hotel)\b/;
const FOOD_ORDER = /\b(food|makan|makanan|mart|belanja|kirim|paket|send|express|gosend|go-?send|grabexpress|grab express)\b/;
const COOKED = /\b(goreng|bakar|geprek|penyet|rica|kremes|crispy|katsu|panggang|rebus|pecel|soto|sate|lalapan|nasi|gulai|opor|kari|teriyaki|asam manis|saus|bumbu|pedas)\b/;
const RAW = /\b(potong|mentah|fillet|kg|kilo|ons|pasar|segar|ekor|utuh|giling|frozen|beku)\b|\d\s*(?:kg|gr|gram|ons)\b/;
const VEHICLE = /\b(motor|mobil|kendaraan|matic|nmax|pcx|beat|vario|scoopy|avanza|xenia|innova|brio|jazz)\b/;
const GADGETS = /\b(hp|handphone|laptop|komputer|pc|tv|jam|kulkas|mesin cuci|ac|printer)\b/;

const RULES: Rule[] = [
  // Food and drink
  R(/\b(sarapan|breakfast|makan pagi)\b/, 'breakfast', 4.5),
  R(/\b(makan siang|lunch|maksi)\b/, 'lunch', 4.5),
  R(/\b(makan malam|dinner|makmal)\b/, 'dinner', 4.5),
  R(/\b(makan|makanan|nasi|nasgor|mie|bakmi|bakso|soto|sate|satai|rawon|pecel|gado-gado|gado gado|ketoprak|lontong|bubur|nasi uduk|nasi padang|rm padang|masakan padang|warteg|burger|pizza|kfc|mcd|mekdi|hokben|richeese|sushi|ramen|martabak|kebab|siomay|seblak|dimsum|steak|geprek|penyet|pempek|mie ayam|indomie|bebek|seafood|resto|restoran|rumah makan|warung makan|kantin|katering|catering|prasmanan)\b/, 'food', 3.2, { veto: /\b(makanan (?:kucing|anjing|hewan|ikan|burung)|makan kucing|pakan)\b/ }),
  R(/\bayam\b/, 'food', 2.5, { minus: RAW }),
  R(/\b(ayam|ikan|daging|udang|cumi|sapi)\b/, 'groceries', 1.5, { plus: RAW, minus: COOKED, veto: /\bikan hias\b/ }),
  R(/\b(beras|minyak goreng|telur|telor|gula|garam|tepung|sayur|sayuran|buah|bumbu dapur|bumbu|kecap|sambal botol|mie instan|susu uht|bahan makanan|belanja dapur|belanja sayur|belanja pasar|pasar|sembako|groceries|grocery|kebutuhan dapur|kebutuhan pokok|superindo|hypermart|transmart|lottemart|lotte mart|ranch market|grand lucky|hero|giant|tukang sayur|sayur box|sayurbox|segari|astro)\b/, 'groceries', 3.6, { veto: /\bbuah hati\b/ }),
  R(/\b(jajan|jajanan|snack|cemilan|camilan|ngemil|keripik|kripik|coklat|cokelat|permen|es krim|eskrim|chiki|chitato|roti|donat|kue|biskuit|wafer|gorengan|cilok|cimol|batagor|pisang goreng|martabak manis|terang bulan)\b/, 'snack', 3),
  R(/\b(minum|minuman|es teh|teh|tea|es jeruk|jus|juice|susu|milk|boba|thai tea|soda|cola|sprite|fanta|pocari|mizone|yakult|teh botol|teh pucuk|pulpy|mixue|chatime|haus|es campur|es buah|es kelapa|kelapa muda|smoothie|milkshake|es cendol|cendol|dawet)\b/, 'drink', 3.5, { veto: /\b(susu (?:formula|bayi|anak|ibu hamil))\b/ }),
  R(/\b(air minum|air mineral|air putih|air galon|galon|aqua|le ?minerale|cleo|ades|isi ulang galon)\b/, 'drink', 4.6),
  R(/\bair\b/, 'drink', 1.5, { plus: DRINKING, hint: SHOPS, minus: WATER_BILL, veto: NOT_WATER, max: 60000, cheap: 25000 }),
  R(/\bair\b/, 'water', 2, { plus: WATER_BILL, hint: /\b(bayar|bulan ini|bulanan|langganan)\b/, minus: DRINKING, veto: NOT_WATER, min: 30000, big: 90000 }),
  R(/\b(kopi|coffee|ngopi|latte|cappuccino|kapucino|espresso|americano|mocha|kopi susu|starbucks|sbux|fore|tomoro|point coffee|janji jiwa|kenangan|excelso|anomali|cafe|kafe|coffee shop)\b/, 'coffee', 4),
  R(/\b(gofood|go-?food|grabfood|grab ?food|shopeefood|shopee ?food|pesan antar|delivery)\b|\b(gojek|grab|shopee|maxim)\s+(?:makan|makanan|food)\b/, 'delivery', 4.6),
  // Transport and vehicles
  R(/\b(bensin|pertalite|pertamax|pertamax turbo|dexlite|solar|bbm|spbu|shell|bp akr|isi bensin)\b/, 'fuel', 4.6, { veto: /\bshell (?:kerang|laut)\b/ }),
  R(/\b(parkir|parking)\b/, 'parking', 4.6),
  R(/\b(tol|toll|e-?toll|etoll)\b/, 'toll', 4.2),
  R(/\b(gojek|grab|maxim|indrive|indriver|uber)\b/, 'ride', 3.8, { veto: FOOD_ORDER }),
  R(/\b(ojek|ojol|goride|go-?ride|grabbike|grab bike|maxim bike|ojek pangkalan)\b/, 'ojek', 4.2, { veto: FOOD_ORDER }),
  R(/\b(taksi|taxi|gocar|go-?car|grabcar|grab car|bluebird|blue bird|maxim car)\b/, 'taxi', 4.2, { veto: FOOD_ORDER }),
  R(/\b(ongkir|ongkos kirim|kirim paket|paket kiriman|jne|jnt|j&t|sicepat|anteraja|pos indonesia|gosend|go-?send|grabexpress|grab express|lalamove|deliveree|ekspedisi|kurir)\b/, 'shipping', 3.8),
  R(/\b(krl|commuter|commuterline|mrt|lrt|transjakarta|busway|bus|angkot|damri|travel|shuttle|kopaja|metromini|trans jogja|trans semarang|suroboyo bus)\b/, 'public', 3.6, { veto: /\b(liburan|hotel|traveloka)\b/ }),
  R(/\b(kereta|tiket kereta|kereta api|kai|argo|whoosh|kereta cepat|krl|commuter line)\b/, 'train', 4),
  R(/\b(tiket pesawat|pesawat|flight|garuda|lion air|citilink|airasia|air asia|batik air|super air jet|pelita air|sriwijaya)\b/, 'flight', 4.6),
  R(/\b(kapal|ferry|feri|pelni|speedboat|pelabuhan|penyeberangan)\b/, 'ship', 4),
  R(/\b(sewa mobil|sewa motor|rental mobil|rental motor|rent car)\b/, 'rental', 4.6),
  R(/\b(servis|service|bengkel|tune up|turun mesin|montir)\b/, 'vehicle_service', 3.2, { plus: VEHICLE, veto: /\b(servis|service|perbaikan|benerin)\s+(?:hp|handphone|laptop|komputer|pc|tv|jam|ac|kulkas|mesin cuci|printer)\b|\bservice fee\b|\bservis rumah\b/ }),
  R(/\b(oli|ganti oli|oli mesin|ban|tambal ban|aki|sparepart|spare part|onderdil|kampas rem|busi|rantai|velg|knalpot)\b/, 'vehicle_parts', 4),
  R(/\b(cuci motor|cuci mobil|salon mobil|detailing|coating|poles mobil|poles motor)\b/, 'vehicle_wash', 4.6),
  R(/\b(stnk|samsat|pajak motor|pajak mobil|pajak kendaraan|perpanjang sim|bikin sim|buat sim)\b/, 'vehicle_tax', 4.6),
  // Bills
  R(/\b(listrik|pln|token listrik|token pln|pulsa listrik|meteran listrik)\b/, 'electricity', 5),
  R(/\btoken\b/, 'electricity', 3, { veto: /\b(game|diamond|voucher|crypto|kripto|nft)\b/ }),
  R(/\b(pdam|tagihan air|rekening air|air pdam|abonemen air|meteran air)\b/, 'water', 5),
  R(/\b(internet|wifi|wi-fi|indihome|biznet|first media|firstmedia|myrepublic|iconnet|mnc play|xl home|cbn|oxygen)\b/, 'internet', 4.6),
  R(/\b(pulsa|telkomsel|simpati|kartu as|byu|by\.u|xl|axis|indosat|im3|smartfren|telepon|telpon)\b/, 'phone', 4.6),
  R(/\b(kuota|paket data|paket internet|internet hp|data seluler)\b/, 'mobile_data', 4.8),
  R(/\b(gas|elpiji|lpg|tabung gas|isi gas|gas melon)\b/, 'gas', 4, { veto: /\bgas (?:pol|keun|ken)\b/ }),
  R(/\b(kos|kost|kosan|kontrakan|sewa rumah|sewa kamar|sewa apartemen|apartemen|kpr|cicilan rumah|ipl|uang sewa|bayar sewa)\b/, 'housing', 4.6),
  R(/\b(asuransi|premi|bpjs|prudential|allianz|axa|manulife|sequis)\b/, 'insurance', 4.6),
  R(/\b(iuran|iuran rt|iuran rw|uang keamanan|keamanan|uang sampah|sampah|ronda|kas rt|kas rw)\b/, 'dues', 3.8, { veto: /\b(iuran (?:kantor|kelas|arisan)|kas kantor)\b/ }),
  R(/\b(cicilan|angsuran|kredit|paylater|kredivo|akulaku|spaylater)\b/, 'installment', 3.4),
  R(/\b(tagihan|bayar tagihan)\b/, 'bills', 2.2),
  // Home
  R(/\b(sabun|detergen|deterjen|rinso|so klin|molto|softener|pewangi|pembersih|karbol|wipol|sunlight|mama lemon|sapu|alat pel|pel|tisu|tissue|pengharum|kamper|obat nyamuk|baygon|sikat|spons|kantong sampah|plastik sampah|lampu|bohlam|baterai|batre|korek|lilin|ember|hanger|gantungan baju)\b/, 'household', 3.2, { veto: /\b(sabun muka|facial wash|sabun cuci muka|sikat gigi)\b/ }),
  R(/\b(sabun|detergen|deterjen|rinso|so klin|molto|softener|pewangi|pembersih|tisu|tissue|pengharum|kamper|obat nyamuk|baygon|sikat|spons|kantong sampah|lampu|bohlam|baterai|batre)\b/, 'shopping', 2.2, { veto: /\b(sabun muka|facial wash|sabun cuci muka|sikat gigi)\b/ }),
  R(/\b(laundry|londri|cuci baju|cuci setrika|setrika|dry clean|binatu)\b/, 'laundry', 4.6),
  R(/\b(kasur|lemari|meja|kursi|sofa|rak|karpet|gorden|gordyn|sprei|seprai|bantal|guling|selimut|kipas angin)\b/, 'furniture', 3.6),
  R(/\b(servis ac|service ac|cuci ac|isi freon|servis kulkas|servis mesin cuci|tukang|renovasi|cat tembok|genteng|keran|kran|pipa|pompa air|perbaikan rumah|servis rumah)\b/, 'home_repair', 4.2),
  R(/\b(gaji|thr|upah|bonus|uang makan)\s+(?:buat\s+|untuk\s+|ke\s+)?(?:art|pembantu|asisten|bibi|bi|mbak|mba|sopir|supir|satpam|tukang kebun|pengasuh|suster|babysitter|baby sitter|ob|office boy)\b/, 'helper', 5.6),
  R(/\b(art|pembantu|asisten rumah tangga|pengasuh|babysitter|baby sitter|tukang kebun)\b/, 'helper', 2.6),
  // Personal care and health
  R(/\b(potong rambut|cukur|pangkas|barber|barbershop|salon|creambath|smoothing|rebonding|catok|cat rambut|semir rambut|haircut)\b/, 'haircut', 4.6),
  R(/\b(skincare|serum|toner|moisturizer|pelembab|sunscreen|sunblock|facial wash|sabun muka|facial|masker wajah|makeup|make up|lipstik|lipstick|bedak|foundation|cushion|parfum|deodoran|deodorant|body lotion|lotion|shampo|shampoo|sampo|kondisioner|conditioner|odol|pasta gigi|sikat gigi|pembalut|softex|cotton bud|kapas)\b/, 'skincare', 3.8),
  R(/\b(dokter|klinik|rumah sakit|rs|puskesmas|periksa|konsultasi|halodoc|alodokter|laboratorium|cek darah|rontgen|usg|vaksin|imunisasi|dokter gigi|scaling|tambal gigi|behel|cabut gigi|kacamata|optik|lensa kontak|softlens|mcu|medical check ?up|terapi|fisioterapi|bidan)\b/, 'doctor', 4.6),
  R(/\b(obat|apotek|apotik|kimia farma|k24|guardian|century|watson|vitamin|suplemen|paracetamol|panadol|bodrex|antimo|tolak angin|minyak kayu putih|minyak telon|salep|plester|hansaplast|masker|betadine|promag|oskadon|decolgen|neozep|antangin)\b/, 'medicine', 4.2, { veto: /\bobat nyamuk\b/ }),
  R(/\b(gym|fitness|yoga|pilates|zumba|renang|kolam renang|futsal|badminton|bulu tangkis|bulutangkis|sewa lapangan|lapangan|personal trainer|marathon|lari)\b/, 'fitness', 4),
  // Shopping
  R(/\b(baju|kaos|kaus|kemeja|celana|jeans|rok|dress|gamis|mukena|sarung|jilbab|kerudung|hijab|jaket|hoodie|sweater|cardigan|blazer|topi|kaus kaki|kaos kaki|pakaian dalam|underwear|seragam|batik)\b/, 'clothing', 3.8, { veto: /\bbatik air\b/ }),
  R(/\b(sepatu|sneakers|sneaker|sandal|sendal|sepatu lari|high heels|flat shoes|boots)\b/, 'shoes', 4.2),
  R(/\b(tas|ransel|dompet kulit|ikat pinggang|sabuk|jam tangan|kacamata hitam|perhiasan|kalung|gelang|anting|cincin)\b/, 'accessories', 3.8),
  R(/\b(hp|handphone|smartphone|iphone|samsung|xiaomi|oppo|realme|laptop|macbook|notebook|tablet|ipad|charger|casan|kabel data|powerbank|power bank|earphone|headset|headphone|tws|airpods|mouse|keyboard|monitor|flashdisk|harddisk|ssd|memory card|printer|tinta printer|smartwatch|speaker|casing|case hp|tempered glass|anti gores)\b/, 'gadget', 3.8, { veto: /\b(pulsa|kuota|paket data)\b/ }),
  R(/\b(servis|service|perbaikan|benerin|ganti lcd|ganti baterai)\s+(?:hp|handphone|laptop|komputer|pc|tv|jam|printer)\b/, 'gadget', 4.4),
  R(/\b(shopee|tokopedia|tokped|lazada|blibli|bukalapak|tiktok shop|tiktokshop|zalora|olshop|online shop|belanja online|checkout|marketplace)\b/, 'shopping', 2.4),
  R(/\bbelanja\b/, 'shopping', 2, { minus: /\bbelanja (?:bulanan|dapur|sayur|pasar|sembako)\b/ }),
  R(/\b(kado|hadiah|gift|parsel|parcel|hampers|buket|bouquet|karangan bunga)\b/, 'gift', 4),
  R(/\bbunga\b/, 'gift', 2, { plus: /\b(beli|buket|mawar|melati|anggrek|tulip|papan|karangan|segar|hias|pot)\b/, veto: /\bbunga\s+(?:pinjaman|kartu|kredit|cicilan|utang|hutang|paylater|bank|deposito|tabungan|kpr)\b/ }),
  R(/\b(mainan|lego|action figure|gundam|boneka|puzzle|alat pancing|pancing|tanaman|pot tanaman|pupuk|akuarium|aquarium|kamera|lensa kamera|drone|gitar|senar)\b/, 'hobby', 3.2),
  // Fun, subscriptions
  R(/\b(bioskop|nonton film|nonton|film|cgv|xxi|cinepolis|imax|tiket bioskop|tiket film)\b/, 'movies', 4.2, { minus: /\bnonton (?:konser|bola|pertandingan|teater)\b/ }),
  R(/\b(konser|festival|pameran|tiket konser|tiket masuk|wahana|dufan|ancol|kebun binatang|ragunan|museum|taman hiburan|waterpark|water park|karaoke|bowling|billiard|biliar|timezone|escape room|trampolin|nonton konser|nonton bola|teater)\b/, 'events', 4),
  R(/\b(game|games|top ?up game|diamond|uc pubg|voucher game|steam|playstation|psn|nintendo|mobile legends|mobile legend|free fire|genshin|robux|valorant|battle pass|gacha)\b/, 'games', 4),
  R(/\b(nongkrong|hangout|ngopi bareng|main bareng|healing|jalan-jalan|jalan jalan|refreshing)\b/, 'entertainment', 3),
  R(/\b(netflix|youtube premium|yt premium|disney|hotstar|vidio|viu|wetv|iqiyi|prime video|amazon prime|hbo|catchplay)\b/, 'streaming', 4.6),
  R(/\b(spotify|youtube music|apple music|joox|resso|langganan musik)\b/, 'music', 4.6),
  R(/\b(icloud|google one|google drive|dropbox|chatgpt|openai|claude|canva|adobe|microsoft 365|office 365|zoom|capcut|notion|figma|github|domain|hosting|vps|app store|play store|playstore|langganan)\b/, 'subscription', 4),
  // Learning
  R(/\b(spp|uang sekolah|biaya sekolah|sekolah|kuliah|ukt|semester|uang pangkal|uang gedung|daftar ulang|kursus|les|bimbel|bimbingan belajar|seminar|webinar|workshop|pelatihan|training|sertifikasi|ujian|toefl|ielts|udemy|coursera|ruangguru|zenius|bootcamp|kelas online)\b/, 'education', 4.2),
  R(/\b(buku|novel|komik|majalah|ebook|e-book|gramedia|kindle)\b/, 'books', 4, { veto: /\bbuku tabungan\b/ }),
  R(/\b(atk|alat tulis|pulpen|pena|pensil|penghapus|penggaris|spidol|kertas|map|fotokopi|fotocopy|foto copy|print|nge-?print|printout|jilid|laminating|laminasi|materai|meterai)\b/, 'stationery', 3.8),
  // People
  R(/\b(sedekah|infaq|infak|zakat|zakat fitrah|zakat mal|wakaf|donasi|sumbangan|nyumbang|amal|kotak amal|kolekte|perpuluhan|persembahan|kitabisa|panti asuhan|fidyah|kurban|qurban)\b/, 'charity', 4.8),
  R(/\b(amplop|takziah|takjiah|melayat|layat|syukuran|selamatan|hajatan|lahiran|aqiqah|akikah|khitanan|sunatan|jenguk|besuk|arisan|reuni|buka bersama|bukber)\b/, 'social', 4),
  R(/\b(kondangan|nikahan|pernikahan|resepsi|kawinan)\b/, 'wedding', 4.4),
  R(/\b(ulang tahun|ultah|birthday|kue ulang tahun)\b/, 'birthday', 4),
  R(/\b(popok|pampers|diapers|mamypoko|merries|sweety|susu formula|susu bayi|susu anak|bayi|baby|mpasi|stroller|uang saku anak|jajan anak|spp anak|mainan anak)\b/, 'family', 4.6),
  R(/\b(ortu|orang tua|keluarga|mertua|uang bulanan (?:ortu|orang tua|mama|papa|ibu|bapak))\b/, 'family', 3.2),
  R(/\b(anak|istri|suami|ortu|orang tua|ibu|bapak|ayah|mama|papa|mamah|adik|kakak|keluarga|mertua|nenek|kakek|ponakan|keponakan)\b/, 'family', 1.8, { plus: /\b(kirim|transfer|kasih|ngasih|uang saku|uang jajan|uang bulanan|jatah)\b/ }),
  R(/\b(kucing|anjing|whiskas|royal canin|pasir kucing|pakan|makanan kucing|makanan anjing|makanan hewan|grooming|dokter hewan|vet|petshop|pet shop|ikan hias)\b/, 'pets', 4.6),
  R(/\b(kantor|dinas|perjalanan dinas|meeting|rapat|operasional|keperluan kantor)\b/, 'work', 2),
  // Travel
  R(/\b(hotel|penginapan|airbnb|villa|resort|homestay|hostel)\b/, 'hotel', 4.6),
  R(/\b(traveloka|tiket\.com|agoda|booking\.com|liburan|wisata|piknik|staycation|visa|paspor|tour|trip)\b/, 'travel', 3.8),
  R(/\b(oleh-oleh|oleh oleh|souvenir|cenderamata)\b/, 'souvenir', 4.6),
  // Fees
  R(/\b(biaya admin|admin bank|biaya transfer|biaya tarik|tarik tunai|biaya layanan|service fee|biaya kartu|iuran kartu|annual fee|denda|penalti|bunga pinjaman|bunga kartu|bunga kredit|admin fee|potongan admin)\b/, 'fees', 4.6),
  R(/\badmin\b/, 'fees', 3),
  R(/\b(pajak|pbb|pph|ppn|spt)\b/, 'tax', 4, { minus: /\bpajak (?:motor|mobil|kendaraan)\b/ }),
  // Income
  R(/\b(gaji|gajian|salary|payroll|upah)\b/, 'salary', 4.6),
  R(/\b(lembur|overtime|uang lembur)\b/, 'overtime', 5),
  R(/\b(bonus|insentif|incentive|rapel|jaspro|jasa produksi)\b/, 'bonus', 4.8),
  R(/\b(thr|tunjangan|tunjangan hari raya)\b/, 'allowance', 4.8),
  R(/\b(komisi|affiliate|afiliasi|referral|fee)\b/, 'commission', 4),
  R(/\b(freelance|proyek|project|projek|honor|honorarium|klien|client|endorse|endorsement|ngajar|mengajar|les privat|jasa|orderan)\b/, 'freelance', 3.8),
  R(/\b(jual|jualan|penjualan|hasil jual|terjual|laku|omzet|omset|dagangan|preloved|lelang)\b/, 'sales', 4.6),
  R(/\b(bunga deposito|bunga tabungan|bunga bank|bunga obligasi|kupon obligasi|kupon sbn|kupon ori|imbal hasil)\b/, 'interest', 5),
  R(/\bbunga\b/, 'interest', 1.5, { plus: /\b(deposito|tabungan|bank|obligasi|sbn|ori|sukuk|investasi|p2p|reksadana)\b/, veto: /\b(beli|buket|mawar|melati|anggrek|karangan|papan|pinjaman|kredit|cicilan)\b/ }),
  R(/\b(dividen|dividend|capital gain|profit|cuan|untung|hasil investasi|keuntungan)\b/, 'dividend', 4.2),
  R(/\b(cashback|cash back|reward|poin|koin|gopay coins|ovo points)\b/, 'cashback', 4.8),
  R(/\b(refund|pengembalian dana|dana kembali|uang kembali|retur|pengembalian)\b/, 'refund', 4.6),
  R(/\b(patungan|urunan|split bill|splitbill)\b/, 'split', 3.6),
  R(/\b(angpao|angpau|hadiah|kado uang|kiriman|uang saku|uang jajan|warisan|dikasih|pemberian|dikirim|dikirimi|dikirimin)\b/, 'gift_in', 3.6),
  R(/\b(dari|dr|sama|ama)\s+(mama|mamah|mami|papa|papah|papi|ibu|bapak|ayah|ortu|orang tua|om|tante|nenek|kakek|kakak|abang|adik|mertua|pacar|suami|istri)\b/, 'gift_in', 3.4),
  R(/\b(sewa|kos|kost|kosan|kontrakan)\b/, 'rent_in', 3),
  R(/\b(reimburse|reimbursement|klaim|claim|penggantian)\b/, 'reimbursement', 3.6),
  R(/\barisan\b/, 'other_in', 2.6),
];

/** `contested`: the word could also be read as something else ("air": a drink or the water bill), so the reading took context. */
export type ConceptHit = { score: number; word: string; start: number; contested?: boolean };
/** What the text is about, with a score per concept (only the given direction). */
export function readConcepts(text: string, amount: number, flow?: Flow) {
  const found = new Map<string, ConceptHit>();
  const spans: { concept: string; start: number; end: number }[] = [];
  for (const rule of RULES) {
    const m = rule.match.exec(text);
    if (!m) continue;
    spans.push({ concept: rule.concept, start: m.index, end: m.index + m[0].length });
    if (flow && conceptById.get(rule.concept)!.type !== flow || rule.veto?.test(text)) continue;
    let score = rule.weight;
    if (rule.plus?.test(text)) score += 2;
    if (rule.hint?.test(text)) score += 1;
    if (rule.minus?.test(text)) score -= 2.5;
    if (amount && (rule.min && amount < rule.min || rule.max && amount > rule.max)) score -= 1.5;
    if (amount && (rule.cheap && amount <= rule.cheap || rule.big && amount >= rule.big)) score += 1;
    if (score <= 0) continue;
    const before = found.get(rule.concept);
    // More words for the same thing add a little; the strongest one leads.
    if (!before) found.set(rule.concept, { score, word: m[0], start: m.index });
    else found.set(rule.concept, before.score >= score ? { ...before, score: Math.min(8, before.score + score * .35) } : { score: Math.min(8, score + before.score * .35), word: m[0], start: m.index });
  }
  // The same words also matched another reading: the same word ("air"), or an unrelated thing ("gojek" a ride, "gojek makan" food).
  for (const [concept, hit] of found) {
    const end = hit.start + hit.word.length;
    hit.contested = spans.some(span => span.concept !== concept && span.start < end && hit.start < span.end && (text.slice(span.start, span.end) === hit.word || !related(span.concept, concept)));
  }
  return found;
}

// Money in or out.
const INCOME_CUES: [RegExp, number][] = [
  [/\b(terima|nerima|diterima|dapat|dapet|dikasih|dikirim|dikirimi|dikirimin|ditransfer|ditransferin|dibayar|dibayarin|cair|dicairkan|pencairan|gajian|terjual|laku|untung|cuan)\b/, 3],
  // Things that are only ever received. ("hadiah", "kos", "patungan" can go either way, so they don't count here.)
  [/\b(gaji|gajian|salary|payroll|upah|lembur|overtime|bonus|insentif|thr|tunjangan|rapel|komisi|dividen|dividend|cashback|cash back|refund|pengembalian dana|imbal hasil|bunga deposito|bunga tabungan|capital gain|honor|honorarium|omzet|omset|penjualan|hasil jual)\b/, 3.5],
  [/\b(jual|jualan)\b/, 3],
  // Work paid to you: freelance, projects, endorsements ("bayar freelancer" stays spending: the verb comes first).
  [/\b(freelance|proyek|project|projek|honor|honorarium|endorse|endorsement|fee proyek|job sampingan|sampingan|orderan|royalti|royalty|affiliate|afiliasi)\b/, 3.5],
  // Money sent by family or friends.
  [/\b(transferan|kiriman|dikirim|dikasih|dapat|dapet)\b.{0,24}\b(dari|dr|sama|ama)\b/, 2],
  [/\b(transferan masuk|uang masuk|dana masuk|masuk (?:ke )?(?:rekening|rek|dompet|saldo|tabungan))\b/, 3.5],
  [/\bmasuk\b(?!\s+(?:angin|kerja|kantor|sekolah|kuliah|kelas|rumah sakit|rs|tol|kos))/, 1.5],
];
const EXPENSE_CUES: [RegExp, number][] = [
  [/\b(beli|bayar|byr|jajan|belanja|habis|abis|keluar|traktir|nraktir|kasih|ngasih|kirim|ngirim|transfer ke|tf ke|donasi|sedekah|nyumbang|order|pesan|pesen|checkout|sewa|servis|service|isi|top ?up|potong|langganan)\b/, 3],
  // Paying people who work for you, entry fees, loan interest, flowers: spending, even with "gaji", "thr", "masuk", "bunga".
  [/\b(gaji|thr|upah|bonus|uang makan)\s+(?:buat\s+|untuk\s+|ke\s+)?(?:art|pembantu|asisten|bibi|bi|mbak|mba|sopir|supir|satpam|tukang|pengasuh|suster|babysitter|baby sitter|ob|office boy|karyawan|pegawai|kurir|guru les|guru ngaji)\b/, 9],
  [/\b(tiket masuk|biaya masuk|uang masuk (?:sekolah|kuliah|tk|sd|smp|sma)|uang pangkal|uang gedung|pendaftaran|registrasi|daftar ulang)\b/, 9],
  [/\bbunga\s+(?:pinjaman|kartu|kredit|cicilan|utang|hutang|paylater|kpr)\b/, 7],
  [/\b(?:beli|buket|karangan)\s+bunga\b|\bbunga\s+(?:mawar|melati|anggrek|tulip|papan|segar|hias|matahari)\b/, 7],
];
/**
 * Whether money comes in: income words and income things (gaji, bonus, dividen, cashback…) against spending words.
 * The first verb of the sentence counts more ("beli pulsa pakai cashback" is spending). Spending is the default.
 */
export function flowOf(text: string): Flow {
  let income = 0, expense = 1;
  const add = (list: [RegExp, number][], to: 'in' | 'out') => { for (const [pattern, weight] of list) { const m = pattern.exec(text); if (!m) continue; const w = m.index === 0 ? weight * 1.5 : weight; if (to === 'in') income += w; else expense += w; } };
  add(INCOME_CUES, 'in'); add(EXPENSE_CUES, 'out');
  return income > expense ? 'income' : 'expense';
}

/** Words that mean different things; naming a category with one of them is weaker evidence. */
const AMBIGUOUS = new Set(['air', 'token', 'tiket', 'gas', 'sewa', 'susu', 'es', 'bunga', 'admin', 'fee', 'service', 'servis', 'cuci', 'online', 'data', 'main', 'kos', 'acara', 'aktivitas']);
/** Words that say little about what a category holds. */
const GENERIC_NAMES = new Set(['lainnya', 'lain', 'other', 'others', 'umum', 'dll', 'misc', 'dan', 'biaya', 'tambahan']);

// The person's categories, read once per list.
type CatLike = Pick<Category, 'id' | 'name' | 'type' | 'parentId' | 'isArchived'> & { templateKey?: string; icon?: string };
/** `inherited`: a vague subcategory name ("Air", "Lainnya") read through its main category. */
type CatInfo = { cat: CatLike; concepts: Map<string, number>; name: string; inherited: boolean };
const lowerId = (text: string) => text.toLocaleLowerCase('id-ID');
const escapeRe = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const has = (text: string, phrase: string) => new RegExp(`(?:^|[^\\p{L}\\p{N}])${escapeRe(phrase)}(?![\\p{L}\\p{N}])`, 'u').test(text);
const noSelector = (emoji?: string) => (emoji || '').replace(/️/g, '');
/** The concepts a category stands for, from its name, the template it came from, and its icon. */
function conceptsOfName(cat: CatLike, type: Flow) {
  const tail = cat.templateKey ? cat.templateKey.split('.').pop()!.replace(/-/g, ' ') : '';
  const text = `${lowerId(cat.name)} ${tail}`.trim(), icon = noSelector(cat.icon);
  const hits: { id: string; strength: number; span: string }[] = [];
  for (const concept of CONCEPTS) {
    if (concept.type !== type) continue;
    let strength = 0, span = '';
    for (const raw of concept.names) { const weak = raw.startsWith('~'), name = weak ? raw.slice(1) : raw; if (has(text, name) && (weak ? .5 : 1) > strength) { strength = weak ? .5 : 1; span = name; } }
    if (icon && [...concept.icons.replace(/️/g, '')].length && concept.icons.replace(/️/g, '').includes(icon)) strength = Math.max(strength, .6);
    if (strength) hits.push({ id: concept.id, strength, span });
  }
  // A longer phrase wins over a word inside it ("belanja bulanan" is groceries, not shopping in general).
  return new Map(hits.filter(hit => !hits.some(other => other !== hit && other.span.length > hit.span.length && other.span.includes(hit.span) && other.strength >= hit.strength)).map(hit => [hit.id, hit.strength]));
}
const infoCache = new WeakMap<object, Map<Flow, CatInfo[]>>();
function categoryInfo(categories: CatLike[], type: Flow) {
  let byType = infoCache.get(categories);
  if (!byType) { byType = new Map(); infoCache.set(categories, byType); }
  const cached = byType.get(type); if (cached) return cached;
  const own = categories.filter(c => !c.isArchived && c.type === type);
  const tops = new Map(own.filter(c => !c.parentId).map(c => [c.id, conceptsOfName(c, type)]));
  const infos = own.filter(c => !c.parentId || tops.has(c.parentId)).map(cat => {
    let concepts = cat.parentId ? conceptsOfName(cat, type) : tops.get(cat.id)!, inherited = false;
    if (cat.parentId) {
      // A subcategory is read within its category: "Air" under Tagihan is the water bill, "Air" under Makan & Minum is drinking
      // water; "Acara" under Sosial is a social event, not a concert. A clear name of its own ("Keluarga") stays what it says.
      const parent = tops.get(cat.parentId)!;
      if (parent.size) {
        const fitting = new Map([...concepts].filter(([id]) => [...parent.keys()].some(p => related(id, p))));
        const vague = lowerId(cat.name).split(/[^\p{L}\p{N}]+/u).filter(Boolean).every(word => AMBIGUOUS.has(word) || GENERIC_NAMES.has(word));
        inherited = !fitting.size && (!concepts.size || vague);
        concepts = fitting.size ? fitting : inherited ? new Map([...parent].map(([id, strength]) => [id, strength * .9])) : concepts;
      }
    }
    return { cat, concepts, name: lowerId(cat.name), inherited };
  });
  byType.set(type, infos);
  return infos;
}
/** How well a category holds a concept: exact, a broader category (e.g. Makan & Minum for coffee), or a narrower one. */
function affinity(concepts: Map<string, number>, concept: string) {
  let best = 0;
  for (const [id, strength] of concepts) {
    const up = LINEAGE.get(concept)!.indexOf(id), down = LINEAGE.get(id)!.indexOf(concept);
    const fit = id === concept ? 1 : up === 1 ? .75 : up > 1 ? .6 : down > 0 ? .45 : 0;
    best = Math.max(best, strength * fit);
  }
  return best;
}

// The person's habits, learned from their transactions.
type Counts = Map<string, Map<string, number>>;
type Learned = { items: Counts; places: Counts; words: Counts };
const STOP = new Set(['beli', 'bayar', 'buat', 'untuk', 'utk', 'dari', 'yang', 'dan', 'pakai', 'pake', 'via', 'sama', 'bareng', 'lagi', 'tadi', 'ini', 'itu', 'aja', 'saja', 'juga', 'the', 'and', 'for']);
const tokens = (text: string) => lowerId(text).split(/[^\p{L}\p{N}]+/u).filter(word => word.length >= 3 && !STOP.has(word) && !/^\d+$/.test(word));
const learnedCache = new WeakMap<object, Map<Flow, Learned>>();
function learn(history: HistoryTx[], type: Flow): Learned {
  let byType = learnedCache.get(history);
  if (!byType) { byType = new Map(); learnedCache.set(history, byType); }
  const cached = byType.get(type); if (cached) return cached;
  const model: Learned = { items: new Map(), places: new Map(), words: new Map() };
  const bump = (map: Counts, key: string, cat: string) => { if (!key) return; const counts = map.get(key) || new Map<string, number>(); counts.set(cat, (counts.get(cat) || 0) + 1); map.set(key, counts); };
  for (const tx of history.slice(0, 2000)) {
    if (tx.type !== type || !tx.categoryId) continue;
    const cat = tx.subcategoryId || tx.categoryId;
    bump(model.items, lowerId(tx.description || '').trim(), cat);
    bump(model.places, lowerId(tx.merchant || '').replace(/\s+/g, ''), cat);
    for (const word of new Set(tokens(tx.description || ''))) bump(model.words, word, cat);
  }
  byType.set(type, model);
  return model;
}
const share = (counts: Map<string, number> | undefined, cat: string) => { if (!counts) return 0; const total = [...counts.values()].reduce((a, b) => a + b, 0); return (counts.get(cat) || 0) / total * (total / (total + 1)); };

type HistoryTx = Pick<LedgerTx, 'type' | 'description' | 'merchant' | 'categoryId' | 'subcategoryId'>;
export type CategoryGuess = { categoryId: string; subcategoryId: string | null; score: number; why?: string };

const title = (text: string) => text.replace(/(^|\s)\S/g, s => s.toUpperCase());

/**
 * The best of the person's own categories for a spending or income sentence, or null when nothing is clear enough.
 * `text`: the whole sentence (lowercase); `item`: what is left after amount, place, wallet and verbs are taken out.
 */
export function suggestCategory(input: { text: string; item: string; merchant?: string; amount: number; type: Flow }, ctx: { categories: CatLike[]; history: HistoryTx[] }): CategoryGuess | null {
  const { text, item, merchant = '', amount, type } = input;
  const infos = categoryInfo(ctx.categories, type);
  if (!infos.length) return null;
  const read = readConcepts(text, amount, type);
  const model = learn(ctx.history, type);
  const itemKey = item.trim(), placeKey = lowerId(merchant).replace(/\s+/g, '');
  const itemWords = tokens(item);
  const scored = infos.map(info => {
    const reasons: [number, string][] = [];
    // Context words.
    let concept = 0, conceptWhy = '';
    for (const [id, hit] of read) {
      const s = hit.score * affinity(info.concepts, id), label = conceptById.get(id)!.label;
      // "“hadiah” dibaca sebagai hadiah" says nothing; "“air” dibaca sebagai minuman" does.
      if (s > concept) { concept = s; conceptWhy = hit.contested && !hit.word.includes(label) ? `“${hit.word}” dibaca sebagai ${label}` : ''; }
    }
    reasons.push([concept, conceptWhy]);
    // The category named in the sentence.
    // The category's own name in the sentence settles close calls ("tiket konser" → Konser rather than Tiket Hiburan).
    let named = 0;
    if (has(text, info.name)) named = info.cat.parentId ? .8 : .6;
    else { const words = info.name.split(/[^\p{L}\p{N}]+/u).filter(word => word.length >= 3); named = Math.min(.8, words.filter(word => itemWords.includes(word) || word.length >= 4 && itemWords.some(w => w.length >= 4 && (w.startsWith(word) || word.startsWith(w)))).length * .4); }
    // An ambiguous name ("Air") says less, unless its main category already said what it means.
    if (named && !info.inherited && info.name.split(/[^\p{L}\p{N}]+/u).every(word => AMBIGUOUS.has(word) || word.length < 3)) named *= .4;
    reasons.push([named, '']);
    // Habits.
    const exact = itemKey ? share(model.items.get(itemKey), info.cat.id) * 6 : 0;
    reasons.push([exact, 'sama seperti catatanmu sebelumnya']);
    const place = placeKey ? share(model.places.get(placeKey), info.cat.id) * 4.5 : 0;
    reasons.push([place, `biasanya untuk belanja di ${title(merchant)}`]);
    let habit = 0, habitWord = '';
    for (const word of itemWords) { const s = share(model.words.get(word), info.cat.id) * 2.2; if (s > 0) { habit += s; if (!habitWord) habitWord = word; } }
    habit = Math.min(4.5, habit);
    reasons.push([habit, `sesuai kebiasaanmu untuk “${habitWord}”`]);
    let score = reasons.reduce((sum, [s]) => sum + s, 0);
    if (info.cat.parentId && concept > 0) {
      const parent = infos.find(other => other.cat.id === info.cat.parentId);
      if (parent && ![...read.keys()].some(id => affinity(parent.concepts, id) > 0)) score *= .8;
    }
    // The reason worth showing: a habit, or a word that took context to read.
    const top = reasons.filter(([, why]) => why).reduce<[number, string]>((a, b) => b[0] > a[0] ? b : a, [0, '']);
    return { info, score, why: top[0] >= 1 ? top[1] : '' };
  }).sort((a, b) => b.score - a.score || Number(Boolean(b.info.cat.parentId)) - Number(Boolean(a.info.cat.parentId)));
  let best = scored[0];
  if (!best || best.score < 2) return null;
  // Two subcategories of one category nearly tied: the category itself is the safer pick.
  const next = scored[1];
  if (best.info.cat.parentId && next && next.info.cat.parentId === best.info.cat.parentId && next.score >= best.score * .92 && !has(text, best.info.name)) {
    const parent = scored.find(s => s.info.cat.id === best.info.cat.parentId);
    if (parent) best = { ...parent, score: best.score, why: best.why };
  }
  const cat = best.info.cat;
  return { categoryId: cat.parentId || cat.id, subcategoryId: cat.parentId ? cat.id : null, score: best.score, ...(best.why ? { why: best.why } : {}) };
}
