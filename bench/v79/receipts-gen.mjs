/**
 * 7.9 — made-up receipts in the five layouts of the receipts the person sent (bench/v79/receipts-user.mjs): a wholesale
 * shop ("4.000 Kg X 12.500 Rp. 50.000.000" under each name), a minimarket ("NAME QTY PRICE TOTAL", HARGA JUAL, voucher),
 * a hardware shop ("5,000.00 x 4.00 PCS = 20,000.00", "BARIS=3 QTY=6.00"), a small UD shop ("2.500 x2 = 5.000",
 * "Rp.7.000") and a hypermarket (SKU, net price, "2 @ 13,500" / "orig 18,500" with "disc toko"). Written as the OCR
 * reads such a photo, with a few of its misreads. Every shop, number and person is invented.
 *
 * makeSet('gen-dev' | 'gen-hold') → [{ id, text, truth }]; the same name gives the same set. 'gen-hold' also draws
 * shops, products, units and labels that 'gen-dev' never has.
 */
import { rng } from '../minimarket/receipts.mjs';

const GOODS = [
  ['Beras Premium', 12500, 'Kg'], ['Minyak Goreng', 17500, 'Ltr'], ['Gula Pasir', 15000, 'Kg'], ['Teh Celup Isi 25', 7500, 'Box'], ['Mie Instan', 3000, 'Pcs'],
  ['Susu Kental Manis', 12000, 'Klg'], ['Sarden Kaleng', 14000, 'Klg'], ['Telur Ayam', 28000, 'Kg'], ['Tepung Terigu', 11000, 'Kg'], ['Kopi Bubuk', 9500, 'Pcs'],
  ['Kecap Manis', 21000, 'Btl'], ['Garam Halus', 3500, 'Pcs'], ['Air Mineral Dus', 42000, 'Dus'], ['Sabun Cuci', 16500, 'Pcs'], ['Kardus Packing', 9000, 'Pcs'],
];
const GOODS_HOLD = [['Bawang Merah', 38000, 'Kg'], ['Margarin Sachet', 2500, 'Pcs'], ['Saus Sambal', 13000, 'Btl'], ['Biskuit Kaleng', 45000, 'Klg'], ['Kertas HVS', 52000, 'Rim'], ['Korek Api', 1500, 'Ktk']];
const MINI = [
  ['POP MIE AYAM 75G', 4900], ['POP MIE PD.DWR AYM75', 5400], ['NESTLE PURE LIFE 600', 3600], ['LE MINERALE 600ML', 3500], ['ULTRA KCNG HIJAU 250', 4900],
  ['NUTRIJEL PWD.STRW.15', 6600], ['KNZLER SNGLES KJU 65', 8700], ['KANZLR BAKSO ORI 48G', 8700], ['INDOMIE GRG SPC 85G', 3100], ['TEH PUCUK HRM 350ML', 3800],
  ['CHITATO SPCY 68G', 10500], ['OREO VNL 133G', 9200], ['AQUA 1500ML', 6500], ['SILVERQUEEN 58G', 14900], ['TISU PASEO 250S', 18900],
];
const MINI_HOLD = [['YOU C1000 LEMON 140', 7500], ['SARI GANDUM SDW 108', 8900], ['FRESTEA APEL 500ML', 5900], ['TOLAK ANGIN CAIR 15', 4500], ['WALLS PADDLE POP', 6000]];
const TOOLS = [
  ['BATU POTONG 4X1,2MM WD', 5000], ['OB SK ARDE UTC 2LBST-128', 12000], ['STEKER ARDE BROCO 1331055', 11000], ['PAKU BETON 5CM', 18000], ['LEM PIPA 100G', 9500],
  ['STOP KRAN 1/2 ONDA', 27500], ['FITTING LAMPU GANTUNG', 6500], ['ISOLASI LISTRIK NITTO', 4000], ['AMPLAS NO.240', 2500], ['KUAS CAT 2 INCH', 8000],
];
const TOOLS_HOLD = [['SEMEN PUTIH 1KG', 9000], ['KAWAT BENDRAT 1KG', 22000], ['MATA BOR BESI 6MM', 7500], ['SELANG AIR 1/2 METER', 6000]];
const WARUNG = [['Aqua 600ml', 2500], ['Aqua 300ml', 2000], ['Teh Botol', 4000], ['Kopi Kapal Api', 1500], ['Roti Sobek', 9000], ['Indomie Goreng', 3000], ['Rokok Surya 12', 24000], ['Gas Elpiji 3kg', 21000]];
const WARUNG_HOLD = [['Es Batu', 1000], ['Gula 1/4 kg', 4500], ['Sabun Lifebuoy', 4000]];
const HYPER = [
  ['DIAMOND MLUHFLCR1LTR', 13500], ['MOCCA CREAM JUMBO', 18500], ['KANTONG PLASTIK BERB', 200], ['BIMOLI MINYAK 2L', 38900], ['ROMA KELAPA 300G', 9800],
  ['SUNLIGHT JRK NPS 755', 16900], ['FRISIAN FLAG KNTL 37', 13900], ['SO KLIN PEWANGI 800', 13900], ['KECAP BANGO 520ML', 23900], ['GULAKU PREMIUM 1KG', 17900],
];
const HYPER_HOLD = [['CIMORY YOGHURT 250ML', 8900], ['PRONAS KORNET 340G', 32900], ['BAYGON AERO 600ML', 39900]];
const SHOPS = {
  grosir: [['TOKO ABANG', 'GROSIR SEMBAKO DAN BERAS', 'Jl. Rorojonggrang Raya B1 No.13 Kel. Melong - Cimahi'], ['TOKO SUMBER REJEKI', 'GROSIR SEMBAKO', 'Jl. Pasar Baru No. 21 Kec. Lowokwaru - Malang'], ['TOKO BERKAH JAYA', 'AGEN BERAS DAN MINYAK', 'Jl. Raya Kopo No. 88 - Bandung']],
  mini: [['TLOGOMAS 44 MALANG', '08113336422', 'JLN RAYA TLOGOMAS NO. 44 RT. 001 RW. 004,', '65144'], ['SUMBERSARI 12 MALANG', '08123334510', 'JL. SUMBERSARI NO. 12 RT. 003 RW. 002,', '65145']],
  bangunan: [['TOKO BANGUNAN ARTOMORO', 'JL. RAJAK WESI', 'PUJON', 'Telp: 0331-710965 Fax: -'], ['TOKO BANGUNAN SINAR ABADI', 'JL. KAWI NO. 7', 'BATU', 'Telp: 0341-596211 Fax: -']],
  ud: [['UD ASIH', 'Juanda 236 Cilacap', '081327074604'], ['UD MAKMUR', 'Sudirman 41 Purwokerto', '081225530918']],
  kopi: [['TOMORO', 'Mutiara Gading Bekasi'], ['TOMORO', 'Margonda Depok']],
  fore: [['FORE COFFEE', 'Shila at Sawangan'], ['FORE COFFEE', 'Cibubur Junction']],
  osave: [['O! save', 'Jl Raya Pasir Putih', 'Kec Sawangan Kota Depok'], ['O! save', 'Jl Raya Bogor Km 30', 'Kec Cimanggis Kota Depok']],
  resto: [['bentoya', 'Japanese Family Restaurant', 'GRAND CITY LT.4, NO.19', '031-52405781'], ['bentoya', 'Japanese Family Restaurant', 'TUNJUNGAN PLAZA 3 LT.5', '031-53104427']],
  hyper: [['HYPERMART TANJUNG PINANG CITY CENTER', 'JL. RAJA HAJI FISABILILLAH KM.08', 'TELEPHONE : - (0771) 4442205'], ['HYPERMART PALEMBANG SQUARE', 'JL. ANGKATAN 45 NO. 1', 'TELEPHONE : - (0711) 3580113']],
};
const SHOPS_HOLD = {
  grosir: [['TOKO MAJU MAPAN', 'GROSIR SEMBAKO DAN PLASTIK', 'Jl. Imam Bonjol No. 5 Kel. Pendrikan - Semarang']],
  mini: [['DINOYO 7 MALANG', '08113339021', 'JL. MT HARYONO NO. 7 RT. 002 RW. 005,', '65144']],
  bangunan: [['TOKO BANGUNAN KARYA MULIA', 'JL. DIPONEGORO 19', 'KEPANJEN', 'Telp: 0341-395220 Fax: -']],
  ud: [['UD SRI REJEKI', 'Gatot Subroto 9 Kebumen', '085799120344']],
  kopi: [['TOMORO', 'Kota Wisata Cibubur']], fore: [['FORE COFFEE', 'Grand Indonesia']], osave: [['O! save', 'Jl Raya Ciputat 12', 'Kec Pamulang Tangsel']], resto: [['bentoya', 'Japanese Family Restaurant', 'PAKUWON MALL LT.2', '031-73901122']],
  hyper: [['HYPERMART LIPPO PLAZA JEMBER', 'JL. GAJAH MADA NO. 106', 'TELEPHONE : - (0331) 4436700']],
};
const DRINKS = [['Kopi Susu Aren', 24000], ['Coconut Latte', 28000], ['Americano', 18000], ['Matcha Latte', 26000], ['Caramel Macchiato', 31500], ['Butterscotch Sea Salt Latte', 38000], ['Hazelnut Latte', 29000], ['Chocolate Frappe', 33000]];
const DRINKS_HOLD = [['Pandan Latte', 27000], ['Lychee Tea', 22000], ['Avocado Coffee', 35000]];
const SIZES = ['Jumbo', 'Large', 'Regular'], CHOICES = ['Normal Sweet', 'Less Sweet', 'No Topping', 'Less Ice', 'Extra Shot', 'Normal Ice'];
const SHELF = [['Frisian Flag Strawberry 115m', 2600], ['Kraft Keju Cake 16gr', 2000], ['Oreo Softcake Chocolate 16gr', 2000], ['Nissin Walens Choco Soes 100', 8500], ['Oatside Oatmilk Barista Blen', 4900], ['Cimory Fresh Milk Almond 250', 5400], ['NyamNyam Strawberry Stick 25', 3700], ['Roppang Bread Choco Lava 65g', 1600], ['Pepsodent Toothpaste to Prev', 13500], ['My Baby Telon Oil Plus Eucal', 14900], ['Ovaltine Choco Malt 24gr', 2000], ['Mitu Baby Wipes Purple 50 sh', 9900], ['So Klin Liquid Violet Blosso', 400]];
const SHELF_HOLD = [['Indomilk Kids Coklat 115ml', 3300], ['Taro Net Seaweed 36gr', 5200], ['Biore Body Foam Pure Mild 100', 12900]];
const DISHES = [['KIDS BT 3 CKN XRGE', 31818], ['BF STMNA DON', 40909], ['YAKISOBA CHKN TRYK', 35455], ['KANIKAMA CHS RL', 45455], ['TEA-ICE', 9090], ['CHKN KATSU DON', 38182], ['RAMEN SHOYU', 42727], ['OCHA HOT', 6364]];
const DISHES_HOLD = [['TORI KARAAGE SET', 47273], ['MISO SOUP', 10909]];
const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

export function makeSet(name) {
  const hold = name === 'gen-hold', r = rng(hold ? 7902 : 7901), count = 90;
  const pick = list => list[Math.floor(r() * list.length)], int = (a, b) => a + Math.floor(r() * (b - a + 1));
  const p2 = v => String(v).padStart(2, '0');
  const dot = v => String(v).replace(/\B(?=(\d{3})+(?!\d))/g, '.'), comma = v => String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  // The OCR's own misreads, in names only (the truth keeps the name as read): U → J, O → 0, I → l.
  const misread = text => r() < .2 ? text.replace(/[UOI]/, ch => ({ U: 'J', O: '0', I: 'l' })[ch]) : text;
  const goods = (base, extra) => hold ? [...base, ...extra, ...extra] : base;
  const chooseItems = (list, n) => { const used = new Set(), out = []; while (out.length < n && used.size < list.length) { const g = pick(list); if (used.has(g[0])) continue; used.add(g[0]); out.push(g); } return out; };
  const out = [];
  for (let n = 0; n < count; n++) {
    const style = ['grosir', 'mini', 'bangunan', 'ud', 'hyper', 'kopi', 'fore', 'osave', 'resto'][n % 9];
    const shop = pick(hold && r() < .5 ? SHOPS_HOLD[style] : SHOPS[style]);
    const year = int(2019, 2026), month = int(1, 12), day = int(1, 28), hour = int(7, 21), minute = int(0, 59), second = int(0, 59);
    const date = `${year}-${p2(month)}-${p2(day)}`, time = `${p2(hour)}:${p2(minute)}`;
    const lines = [], items = [];
    let total = 0, paid = 0, change = 0, payment = 'cash', subtotal;
    if (style === 'grosir') {
      lines.push(shop[0], shop[1], shop[2], '-'.repeat(60), `No. Struk : ${int(100, 999)} ${p2(day)}.${p2(month)}.${year}-${time}:${p2(second)}`);
      for (const [label, price, unit] of chooseItems(goods(GOODS, GOODS_HOLD), int(2, 8))) {
        const qty = pick([int(1, 9), int(10, 60), int(100, 900)]), amount = qty * price, shown = misread(label);
        lines.push(shown, `${qty >= 1000 ? dot(qty) : qty} ${unit} X ${dot(price)} Rp. ${dot(amount)}`);
        items.push([shown, amount]); total += amount;
      }
      paid = r() < .5 ? total : Math.ceil(total / 50000) * 50000 + (r() < .5 ? 50000 : 0); change = paid - total;
      const [sub, pay, back] = hold ? pick([['Subtotal', 'Bayar', 'Kembali'], ['Total', 'Tunai', 'Kembalian'], ['Jumlah', 'Bayar', 'Kembali']]) : ['Subtotal', 'Bayar', 'Kembali'];
      if (pay !== 'Tunai') payment = '';
      lines.push('-'.repeat(60), `${sub} Rp. ${dot(total)}`, `${pay} Rp. ${dot(paid)}`, `${back} Rp. ${dot(change)}`, 'T E R I M A K A S I H', 'A T A S K U N J U N G A N A N D A');
    } else if (style === 'mini') {
      lines.push(`${shop[0]} ${shop[1]}`, shop[2], shop[3], '-'.repeat(40), `${p2(day)}.${p2(month)}.${String(year).slice(2)}-${time}/2.2.1/F4UB ${int(100000, 999999)}/${pick(['SELVI', 'RINA', 'DEWI', 'AGUS'])}/01`, '-'.repeat(40));
      let sum = 0;
      for (const [label, price] of chooseItems(goods(MINI, MINI_HOLD), int(2, 10))) { const qty = r() < .7 ? 1 : int(2, 4), amount = qty * price; lines.push(`${label} ${qty} ${price} ${comma(amount)}`); items.push([label, amount]); sum += amount; }
      subtotal = sum; const voucher = r() < .4 ? pick([1000, 2000, 2500]) : 0; total = sum - voucher;
      lines.push('-'.repeat(22), `HARGA JUAL : ${comma(sum)}`);
      if (voucher) lines.push(`VC ${pick(['NUTRIJEL KONNYAKU/FORISA NU', 'HEMAT SERBA GRATIS', 'PROMO MINUMAN DINGIN'])} : (${comma(voucher)})`);
      const card = r() < .3;
      paid = card ? total : Math.ceil(total / 1000) * 1000 + pick([0, 500, 5000, 20000]); change = paid - total; payment = card ? 'debit' : 'cash';
      lines.push('-'.repeat(22), `${hold ? pick(['TOTAL', 'TOTAL BELANJA']) : 'TOTAL'} : ${comma(total)}`, `${card ? 'DEBIT BCA' : 'TUNAI'} : ${comma(paid)}`, `KEMBALI : ${comma(change)}`);
      if (voucher) lines.push(`ANDA HEMAT : ${comma(voucher)}`);
      const dpp = Math.round(total / 1.11); lines.push(`PN : DPP= ${comma(dpp)} PPN= ${comma(total - dpp)}`, 'LAYANAN KONSUMEN SMS 0811 1500 280');
    } else if (style === 'bangunan') {
      lines.push(shop[0], shop[1], shop[2], shop[3], `No. : 0${int(100, 999)}/KSR/${p2(month)}/${p2(day)}${String(year).slice(2)} ${p2(day)}-${p2(month)}-${year}`, `Kasir: ${shop[0].split(' ').pop()} ${time}:${p2(second)}`, 'Pel. : UMUM/CASH', '-'.repeat(40));
      let pieces = 0;
      const unit = () => hold ? pick(['PCS', 'PCS', 'BH', 'ROL']) : 'PCS';
      for (const [label, price] of chooseItems(goods(TOOLS, TOOLS_HOLD), int(1, 6))) {
        const qty = r() < .5 ? 1 : int(2, 12), amount = qty * price, shown = misread(label), j = r() < .25 ? 'J' : '0';
        lines.push(shown, `${comma(price)}.0${j} x ${qty}.00 ${unit()} = ${comma(amount)}.00`); items.push([shown, amount]); total += amount; pieces += qty;
      }
      paid = Math.ceil(total / 50000) * 50000; change = paid - total;
      lines.push('-'.repeat(40), `BARIS=${items.length} QTY=${pieces}.00 ${comma(total)}.00`, `${hold ? pick(['Tunai', 'Bayar']) : 'Tunai'} = ${comma(paid)}.00`, '-'.repeat(15), `Kembali = ${comma(change)}.00`, 'Barang yang telah dibeli tidak dapat', 'dikembalikan kecuali ada perjanjian');
    } else if (style === 'ud') {
      lines.push(`${'-'.repeat(10)}${shop[0]}${'-'.repeat(10)}`, shop[1], shop[2], `Tanggal : ${day} ${MONTHS[month - 1]} ${year}`, `${time}:${p2(second)} WIB`, `Id Jual : TRX-${day}${month}${year}${hour}${minute}${second}`, `Kasir : ${pick(['Rafif', 'Sinta', 'Bayu'])}`, '='.repeat(30));
      for (const [label, price] of chooseItems(goods(WARUNG, WARUNG_HOLD), int(1, 5))) { const qty = int(1, 4), amount = qty * price; lines.push(label, `${dot(price)} x${qty} = ${dot(amount)}`); items.push([label, amount]); total += amount; }
      paid = Math.ceil(total / 10000) * 10000 + (r() < .3 ? 10000 : 0); change = paid - total;
      const [pay, back] = hold ? pick([['Tunai', 'Kembali'], ['Bayar', 'Kembalian']]) : ['Tunai', 'Kembali'];
      lines.push('='.repeat(30), `Total : Rp.${dot(total)}`, `${pay} : Rp.${dot(paid)}`, `${back} : Rp.${dot(change)}`, '='.repeat(30), '-Terima Kasih-');
    } else if (style === 'kopi') {
      lines.push('TOMORO', 'C O F F E E', shop[1], String(int(1001, 2999)).replace(/00$/, '07'), pick(['OD', 'TA', 'DI']), '='.repeat(46), `Date: ${p2(day)}/${MONTHS_EN[month - 1]}/${year} ${time}`, 'Channel: SEL-POS', 'Cust Name:', '-'.repeat(46));
      for (const [label, price] of chooseItems(goods(DRINKS, DRINKS_HOLD), int(1, 3))) {
        const qty = r() < .8 ? 1 : 2, amount = qty * price, size = pick(SIZES);
        if (r() < .5) lines.push(`[TT ${MONTHS_EN[month - 1].toUpperCase()}] ${label} | ${pick(DRINKS)[0]} (1 ${size.toUpperCase()}`, ')');
        lines.push(`${label} ${size} ${qty}`, `+${pick(CHOICES)} ${qty}`, `+${pick(CHOICES)} ${qty}`, `${comma(price)} ${qty} ${comma(amount)}`);
        items.push([label, amount]); total += amount;
      }
      const net = Math.round(total / 1.1), label = pick(['TikTok', 'QRIS', 'Cash', 'GoPay']);
      payment = { TikTok: '', QRIS: 'qris', Cash: 'cash', GoPay: 'gopay' }[label];
      paid = label === 'Cash' ? Math.ceil(total / 10000) * 10000 : total; change = paid - total;
      lines.push(`SUBTOTAL: ${comma(net)}`, `Tax: ${comma(total - net)}`, 'ROUNDING: 0', `TOTAL: Rp ${comma(total)}`, '-'.repeat(46), `${label} ${comma(paid)}`, `CHANGE: ${comma(change)}`, `Order Number: T0${year}${p2(month)}${p2(day)}${hour}${minute}${int(100000, 999999)}`, 'Cust ID: null', '='.repeat(46), 'All price are inclusive Tax');
    } else if (style === 'fore') {
      lines.push('FORE COFFEE', shop[1], 'NPWP : 85.411.685.2-067.000', 'PT FORE KOPI INDONESIA', String(int(1001, 9899)).replace(/00$/, '13'), pick(['Take Away Order', 'Dine In Order']), 'Nama Kasir: ~~~~~~', `${DAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()]}, ${day} ${MONTHS[month - 1]} ${year}, ${time}`, `#${String(year).slice(2)}${p2(month)}${p2(day)}${int(100000, 999999)}-~~`);
      const chosen = chooseItems(goods(DRINKS, DRINKS_HOLD), int(1, 3));
      lines.push(`Order Total Order:${chosen.length}`);
      for (const [label, price] of chosen) {
        const qty = r() < .8 ? 1 : 2, amount = qty * price, words = `${pick(SIZES)} Iced ${label}`.split(' '), cut = Math.max(2, Math.ceil(words.length / 2));
        lines.push(`${qty}x ${words.slice(0, cut).join(' ')}`);
        if (words.length > cut) lines.push(words.slice(cut).join(' '));
        lines.push(pick(CHOICES), `Rp ${dot(amount)}`);
        items.push([words.slice(0, 2).join(' '), amount]); total += amount;
      }
      const net = total / 1.1, label = pick(['Debit Kredit EDC BCA', 'QRIS', 'Cash']);
      payment = { 'Debit Kredit EDC BCA': 'debit', QRIS: 'qris', Cash: 'cash' }[label]; paid = total;
      const dec = v => `${dot(Math.floor(v))},${String(Math.round((v % 1) * 100)).padStart(2, '0')}`;
      lines.push(`Total Inc Tax Rp ${dot(total)}`, 'Voucher Discount Rp 0', `SUBTOTAL Rp ${dot(total)}`, `Net Sales Rp ${dec(net)}`, `PB1 10% Rp ${dec(total - net)}`, `${label} Rp ${dot(total)}`, 'Terima Kasih', 'Khusus pengguna baru aplikasi Fore Coffee,', 'Raih diskon 50% max IDR 35K untuk 3x transaksi');
    } else if (style === 'osave') {
      lines.push(shop[0], shop[1], shop[2], 'NPWP:"1000.0000.0189.8896"');
      let pieces = 0;
      for (const [label, price] of chooseItems(goods(SHELF, SHELF_HOLD), int(3, 14))) {
        const qty = r() < .75 ? 1 : int(2, 24), amount = qty * price;
        if (qty > 1) lines.push(`x${qty} ${dot(price)}`);
        lines.push(`${label} ${dot(amount)}`); items.push([label.split(' ')[0], amount]); total += amount; pieces += qty;
      }
      subtotal = total; const round = total % 500; total -= round;
      paid = Math.ceil(total / 10000) * 10000 + pick([0, 10000]); change = paid - total;
      lines.push(`Subtotal(Termasuk PPN): ${dot(subtotal)}`);
      if (round) lines.push(`Pembulatan: -${dot(round)}`);
      lines.push(`Jumlah barang:${pieces} Jumlah: ${dot(total)}`, 'Cash', `Tunai: ${dot(paid)}`, `Kembalian: ${dot(change)}`, `329.1.${int(10000, 99999)}.${int(1000, 9999)}.${p2(day)}/${p2(month)}/${year} ${time}`, 'Buka 7:00 to 22:00');
    } else if (style === 'resto') {
      lines.push(shop[0], shop[1], shop[2], shop[3], 'GUEST BILL', `TABLE : ${int(1, 30)}`, `COVER : ${int(1, 6)} CASHIER : ${pick(['TANTI', 'RINA', 'DODI'])}`, `DATE : ${p2(day)}/${p2(month)}/${year} WAITER : ${pick(['RIO', 'ANI'])}`, `TIME : ${time}:${p2(second)} BILL : ${int(100000, 999999)}`, '='.repeat(32));
      for (const [label, price] of chooseItems(goods(DISHES, DISHES_HOLD), int(2, 6))) { const qty = r() < .7 ? 1 : 2, amount = qty * price; lines.push(`${qty} ${label} ${dot(amount)}`); items.push([label, amount]); total += amount; }
      if (r() < .4) lines.push('1 LUNCH BOX 0');
      subtotal = total; const tax = Math.round(total * .1); total += tax; payment = ''; paid = undefined; change = undefined;
      lines.push('='.repeat(32), `SUBTOTAL = ${dot(subtotal)}`, `TAX = ${dot(tax)}`, `TOTAL = ${dot(total)}`, 'Number of Print : 1', '> GORAITEN ARIGATO GOZAIMASHITA <');
    } else {
      payment = pick(['ovo', 'ovo', 'cash', 'debit']);
      lines.push(shop[0], shop[1], shop[2], 'hyper.cs@hypermart.co.id');
      if (payment === 'ovo') lines.push(`OVO : 80000${int(10000000, 99999999)}0600`);
      lines.push(`PENJUALAN ${int(100, 999)} ${int(10000, 99999)} ${int(1000, 9999)} ${p2(day)}/${p2(month)}/${String(year).slice(2)}`, `${int(100000, 999999)} ${time}:${p2(second)}`);
      let saved = 0, pieces = 0;
      for (const [label, price] of chooseItems(goods(HYPER, HYPER_HOLD), int(1, 6))) {
        const sku = int(10000000, 99999999), kind = price >= 5000 ? pick(['plain', 'multi', 'orig']) : 'plain';
        const qty = kind === 'multi' ? int(2, 3) : 1, disc = kind === 'plain' ? 0 : Math.round(qty * price * pick([.1, .15, .2, .3]) / 10) * 10, net = qty * price - disc;
        lines.push(`${sku} ${label} ${comma(net)}`);
        if (kind === 'multi') lines.push(`${qty} @ ${comma(price)}`, `disc toko (-)( ${qty}) -${comma(disc)}`);
        if (kind === 'orig') lines.push(`orig ${comma(price)}`, `disc toko -${comma(disc)}`);
        items.push([label, net]); total += net; saved += disc; pieces += qty;
      }
      lines.push(`${pieces} ITEMS TOTAL : ${comma(total)}`);
      if (payment === 'ovo') { paid = total; lines.push(`800003xxxxxx0600 OVO PTP : ${comma(total)}`); }
      else if (payment === 'debit') { paid = total; lines.push(`DEBIT BCA : ${comma(total)}`); }
      else { paid = Math.ceil(total / 10000) * 10000; change = paid - total; lines.push(`TUNAI : ${comma(paid)}`, `KEMBALI : ${comma(change)}`); }
      if (saved) lines.push('Anda Hemat', comma(saved));
      lines.push('PT MATAHARI PUTRA PRIMA TBK', 'NPWP : 01.394.013.5-092.000', 'CALL CENTER 1500216', 'HARGA SUDAH TERMASUK PPN', 'TERIMA KASIH ATAS KUNJUNGAN ANDA');
    }
    // The shop's own word ("ABANG", "ARTOMORO", "ASIH"); a hypermarket is its chain; a minimarket's first line is a branch code, not checked.
    const core = style === 'hyper' ? 'HYPERMART' : style === 'osave' ? 'save' : style === 'fore' ? 'fore' : shop[0].replace(/^(TOKO BANGUNAN|TOKO|UD)\s+/, '').split(' ')[0];
    out.push({ id: `${name}-${style}-${n}`, text: lines.join('\n'), truth: {
      ...(style !== 'mini' ? { merchant: new RegExp(core, 'i') } : {}), date, time, total, ...(subtotal !== undefined && style !== 'kopi' ? { subtotal } : {}), ...(paid !== undefined ? { paid } : {}), ...(change !== undefined && (style !== 'hyper' || payment === 'cash') ? { change } : {}), ...(payment ? { payment } : {}), items,
    } });
  }
  return out;
}
