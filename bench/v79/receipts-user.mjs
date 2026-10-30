/**
 * 7.9 — receipts sent by the person (photos in the chat, 30 Oct 2026), written out line by line as the OCR reads
 * such a photo, with the glitches visible in the pictures kept ("BANGJNAN", "12,000.0J"). The photos themselves are not
 * stored. Used while building (dev): they are the layouts the scanner had to learn.
 * truth: what the scanner should read; items as [name start, line total].
 * u1: "Kardus Packing 800 Pcs X 9.000 Rp. 7.800.000": 800 × 9.000 is 7.200.000, and only 7.200.000 makes the items reach
 * the printed subtotal (200.000.000), so 7.200.000 is right (the first version of this truth said 7.800.000, not sure).
 */
export const receipts = [
  { id: 'u1-grosir', text: `TOKO ABANG
GROSIR SEMBAKO DAN BERAS
Jl. Rorojonggrang Raya B1 No.13 Kel. Melong – Cimahi
--------------------------------------------------------------------------
No. Struk : 211 10.01.2023-10:11:07
Beras
4.000 Kg X 12.500 Rp. 50.000.000
Minyak Goreng
1600 Kg X 27.500 Rp. 44.000.000
Gula Pasir
1600 Kg X 15.000 Rp. 24.000.000
The Celup Isi 25
800 Box X 7.500 Rp. 6.000.000
Mie Instan
8.000 Pcs X 3.000 Rp. 24.000.000
Susu Kaleng
1600 Klg X 14.000 Rp. 22.400.000
Sarden
1600 Klg X 14.000 Rp. 22.400.000
Kardus Packing
800 Pcs X 9.000 Rp. 7.800.000
-------------------------------------------------------------------------
Subtotal Rp. 200.000.000
Bayar Rp. 200.000.000
Kembali Rp. 0
T E R I M A K A S I H
A T A S K U N J U N G A N A N D A`,
    truth: { merchant: /toko abang/i, date: '2023-01-10', time: '10:11', total: 200000000, paid: 200000000, change: 0, items: [['Beras', 50000000], ['Minyak Goreng', 44000000], ['Gula Pasir', 24000000], ['The Celup', 6000000], ['Mie Instan', 24000000], ['Susu Kaleng', 22400000], ['Sarden', 22400000], ['Kardus Packing', 7200000]] } },
  { id: 'u2-minimarket', text: `TLOGOMAS 44 MALANG 08113336422
JLN RAYA TLOGOMAS NO. 44 RT. 001 RW. 004,
65144
----------------------------------------
21.01.22-18:27/2.2.1/F4UB 354501/SELVI/01
----------------------------------------
POP MIE AYAM 75G 1 4900 4,900
POP MIE PD.DWR AYM75 1 5400 5,400
NESTLE PURE LIFE 600 2 3600 7,200
LE MINERALE 600ML 2 3500 7,000
ULTRA KCNG HIJAU 250 1 4900 4,900
NUTRIJEL PWD.STRW.15 2 6600 13,200
KNZLER SNGLES KJU 65 1 8700 8,700
KNZLER SNGLES HOT 65 1 8700 8,700
KANZLR BAKSO ORI 48G 2 8700 17,400
----------------------
HARGA JUAL : 77,400
VC NUTRIJEL KONNYAKU/FORISA NU : (2,000)
----------------------
TOTAL : 75,400
TUNAI : 100,500
KEMBALI : 25,100
ANDA HEMAT : 2,000
PN : DPP= 70,364 PPN= 7,036
LAYANAN KONSUMEN SMS 0811 1500 280`,
    truth: { date: '2022-01-21', time: '18:27', total: 75400, subtotal: 77400, paid: 100500, change: 25100, items: [['POP MIE AYAM', 4900], ['POP MIE PD', 5400], ['NESTLE', 7200], ['LE MINERALE', 7000], ['ULTRA', 4900], ['NUTRIJEL', 13200], ['KNZLER SNGLES KJU', 8700], ['KNZLER SNGLES HOT', 8700], ['KANZLR', 17400]] } },
  { id: 'u3-bangunan', text: `TOKO BANGJNAN ARTOMORO
JL. RAJAK WESI
PUJON
Telp: 0331-710965 Fax: -
No. : 0J10/KSR/02/0221 01-02-2021
Kasir: ARTOMORO 09:39:29
Pel. : UMJM/CASH
----------------------------------------
BATU POTJNG 4X1,2MM WD
5,000.00 x 4.00 PCS = 20,000.00
OB SK ARJE UTC 2LBST-128
12,000.0J x 1.00 PCS = 12,000.00
STEAKER ARDE BROCO 1331055
11,000.0J x 1.00 PCS = 11,000.00
----------------------------------------
BARIS=3 QTY=6.00 43,000.00
Tunai = 50,000.00
---------------
Kembali = 7,000.00
Barang yang telah dibeli tidak dapat
dikembalikan kecuali ada perjanjian`,
    truth: { merchant: /artomoro/i, date: '2021-02-01', time: '09:39', total: 43000, paid: 50000, change: 7000, payment: 'cash', items: [['BATU POTJNG', 20000], ['OB SK', 12000], ['STEAKER', 11000]] } },
  { id: 'u4-ud', text: `----------UD ASIH----------
Juanda 236 Cilacap
081327074604
Tanggal : 16 September 2020
21:31:52 WIB
Id Jual : TRX-1692020213152
Kasir : Rafif
==============================
Aqua 600ml
2.500 x2 = 5.000
Aqua 300ml
2.000 x1 = 2.000
==============================
Total : Rp.7.000
Tunai : Rp.10.000
Kembali : Rp.3.000
==============================
-Terima Kasih-`,
    truth: { merchant: /ud asih/i, date: '2020-09-16', time: '21:31', total: 7000, paid: 10000, change: 3000, payment: 'cash', items: [['Aqua 600', 5000], ['Aqua 300', 2000]] } },
  { id: 'u5-hypermart', text: `HYPERMART TANJUNG PINANG CITY CENTER
JL. RAJA HAJI FISABILILLAH KM.08
TELEPHONE : - (0771) 4442205
hypertanjung.pinang@hypermart.co.id
OVO : 8000039721930600
PENJUALAN 438 43813 4909 21/10/19
438432 14:38:37
37502944 DIAMOND MLUHFLCR1LTR 22,580
2 @ 13,500
disc toko (-)( 2) -4,420
92301923 MOCCA CREAM JUMBO 10,900
orig 18,500
disc toko -7,600
42000628 KANTONG PLASTIK BERB 200
4 ITEMS TOTAL : 33,680
800003xxxxxx0600 OVO PTP : 33,680
Anda Hemat
12,020
PT MATAHARI PUTRA PRIMA TBK
NPWP : 01.394.013.5-092.000
CALL CENTER 1500216
BARANG KENA PAJAK
HARGA SUDAH TERMASUK PPN
TERIMA KASIH ATAS KUNJUNGAN ANDA
RF:0438-20191021-43813-4909-64`,
    truth: { merchant: /hypermart/i, date: '2019-10-21', time: '14:38', total: 33680, paid: 33680, payment: 'ovo', items: [['DIAMOND', 22580], ['MOCCA', 10900], ['KANTONG', 200]] } },
  // Second batch (sent later the same day): a coffee chain with a bundle title, a coffee chain with the price under a
  // three-line name, a minimarket with "x5 2.000" printed above the item it counts, and a restaurant's guest bill.
  { id: 'u6-tomoro', text: `TOMORO
C O F F E E
Mutiara Gading Bekasi
2045
OD
==============================================
Date: 22/Apr/2025 14:06
Channel: SEL-POS
Cust Name:
----------------------------------------------
[TT APR] Kopi Susu Aren | Coconut Latte (1 JUMBO
)
Kopi Susu Aren Jumbo 1
+Normal Sweet 1
+No Topping 1
31,500 1 31,500
SUBTOTAL: 28,636
Tax: 2,864
ROUNDING: 0
TOTAL: Rp 31,500
----------------------------------------------
TikTok 31,500
CHANGE: 0
Order Number: T0202504221406106020
Cust ID: null
==============================================
All price are inclusive Tax`,
    truth: { merchant: /tomoro/i, date: '2025-04-22', time: '14:06', total: 31500, paid: 31500, change: 0, items: [['Kopi Susu Aren', 31500]] } },
  { id: 'u7-fore', text: `FORE COFFEE
Shila at Sawangan
NPWP : 85.411.685.2-067.000
PT FORE KOPI INDONESIA
5096
Take Away Order
Nama Kasir: ~~~~~~
Selasa, 25 Februari 2025, 14:38
#250223654757-~~
Order Total Order:1
1x Large Iced Butterscotch
Sea Salt Latte
Less Ice
Rp 38.000
Total Inc Tax Rp 38.000
Voucher Discount Rp 0
SUBTOTAL Rp 38.000
Net Sales Rp 34.545,46
PB1 10% Rp 3.454,54
Debit Kredit EDC BCA Rp 38.000
Terima Kasih
Khusus pengguna baru aplikasi Fore Coffee,
Raih diskon 50% max IDR 35K untuk 3x transaksi
Download sekarang di App Store/Play Store`,
    truth: { merchant: /fore/i, date: '2025-02-25', time: '14:38', total: 38000, paid: 38000, payment: 'debit', items: [['Large Iced Butterscotch', 38000]] } },
  { id: 'u8-osave', text: `O! save
Jl Raya Pasir Putih
Kec Sawangan Kota Depok
NPWP:"1000.0000.0189.8896"
Frisian Flag Strawberry 115m 2.600
Kraft Keju Cake 16gr 2.000
Kraft Keju Cake 16gr 2.000
Kraft Keju Cake 16gr 2.000
x5 2.000
Oreo Softcake Chocolate 16gr 10.000
Nissin Walens Choco Soes 100 8.500
Oatside Oatmilk Barista Blen 4.900
Oatside Oatmilk Barista Blen 4.900
Cimory Fresh Milk Almond 250 5.400
Cimory Fresh Milk Matcha 250 5.400
NyamNyam Strawberry Stick 25 3.700
Roppang Bread Choco Lava 65g 1.600
Pepsodent Toothpaste to Prev 13.500
My Baby Telon Oil Plus Eucal 14.900
Oatside Oatmilk Barista Blen 4.900
Ovaltine Choco Malt 24gr 2.000
Mitu Baby Wipes Purple 50 sh 9.900
x24 400
So Klin Liquid Violet Blosso 9.600
Subtotal(Termasuk PPN): 107.800
Pembulatan: -300
Jumlah barang:45 Jumlah: 107.500
Cash
Tunai: 120.000
Kembalian: 12.500
329.1.32905.4948.04/01/2026 16:41
Buka 7:00 to 22:00
O!Save Warranty: "Jika Anda tidak puas
dengan kualitas suatu produk, cukup
kembalikan untuk pengembalian dana penuh,
tanpa perlu penjelasan."`,
    truth: { merchant: /save/i, date: '2026-01-04', time: '16:41', total: 107500, subtotal: 107800, paid: 120000, change: 12500, payment: 'cash', items: [['Frisian', 2600], ['Kraft', 2000], ['Kraft', 2000], ['Kraft', 2000], ['Oreo', 10000], ['Nissin', 8500], ['Oatside', 4900], ['Oatside', 4900], ['Cimory', 5400], ['Cimory', 5400], ['NyamNyam', 3700], ['Roppang', 1600], ['Pepsodent', 13500], ['My Baby', 14900], ['Oatside', 4900], ['Ovaltine', 2000], ['Mitu', 9900], ['So Klin', 9600]] } },
  { id: 'u9-bentoya', text: `bentoya
Japanese Family Restaurant
GRAND CITY LT.4, NO.19
031-52405781
GUEST BILL
TABLE : 3
COVER : 3 CASHIER : TANTI
DATE : 25/02/2017 WAITER : RIO
TIME : 15:02:41 BILL : 142523
================================
1 KIDS BT 3 CKN XRGE 31.818
1 BF STMNA DON 40.909
1 YAKISOBA CHKN TRYK 35.455
1 KANIKAMA CHS RL 45.455
2 TEA-ICE 18.180
1 LUNCH BOX 0
================================
SUBTOTAL = 171.817
TAX = 17.183
TOTAL = 189.000
Number of Print : 1
> GORAITEN ARIGATO GOZAIMASHITA <`,
    truth: { merchant: /bentoya/i, date: '2017-02-25', time: '15:02', total: 189000, subtotal: 171817, items: [['KIDS', 31818], ['BF STMNA', 40909], ['YAKISOBA', 35455], ['KANIKAMA', 45455], ['TEA', 18180]] } },
];
