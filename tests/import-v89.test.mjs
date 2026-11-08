import test from 'node:test';
import assert from 'node:assert/strict';
import { planImport } from '../lib/import/statement.ts';
import { categoryTemplates, planTemplateSeed } from '../lib/category-templates.ts';

// 8.9 — a bank's "transfer" to a place is a payment, not a transfer to a person; and lines a broader word took the wrong way.
// Made-up lines.
const categories = planTemplateSeed([], categoryTemplates.map(t => t.key)).map(r => ({ id: r.id, ...r.data }));
const byId = new Map(categories.map(c => [c.id, c]));
const label = id => { const c = byId.get(id); if (!c) return null; const p = c.parentId ? byId.get(c.parentId) : null; return p ? `${p.name}/${c.name}` : c.name; };
const one = (description, type = 'expense', amount = 50000) => {
  const read = { rows: [{ line: 1, date: '2026-10-05', description, amount, type }], columns: { date: 'Tanggal', description: ['Keterangan'] }, skipped: 0, unsure: 0 };
  const [x] = planImport(read, { walletId: 'bank', wallets: [{ id: 'bank', name: 'Bank', type: 'bank' }], categories, transactions: [], drafts: [] });
  return { ...x, label: label(x.subcategoryId || x.categoryId) };
};
const TRSF = (rest, dir = 'DB') => `TRSF E-BANKING ${dir} 0510/FTSCY/WS95031 50000.00 ${rest}`;

test('8.9 a transfer to a known place is a payment to it, a transfer to a name is still a person', () => {
  for (const [rest, main] of [['Bakso Pak Kumis', 'Makan & Minum'], ['Janji Jiwa Ciputat', 'Makan & Minum'], ['Celana jeans', 'Belanja'], ['Bayar kos Bu Siti', 'Rumah & Kebutuhan'], ['Tiket Ancol', 'Nongkrong & Hiburan']]) {
    const x = one(TRSF(rest));
    assert.equal(x.person, undefined, rest);
    assert.equal(x.label?.split('/')[0], main, rest);
  }
  assert.equal(one(TRSF('Budi Santoso')).person, 'Budi Santoso');
  assert.equal(one(TRSF('BUDI SANTOSO')).person, 'Budi Santoso');
  assert.equal(one(TRSF('Sari Wulandari', 'CR'), 'income').person, 'Sari Wulandari');
  const bonus = one(TRSF('Bonus Kinerja Q3', 'CR'), 'income', 2_000_000);
  assert.equal(bonus.person, undefined); assert.equal(bonus.label, 'Gaji/Bonus');
});

test('8.9 lines a broader word took the wrong way', () => {
  for (const [line, want, type] of [
    ['Ongkos becak', 'Transportasi'], ['Naik bajaj ke pasar', 'Transportasi'], ['Beli sayur di tukang sayur keliling', 'Makan & Minum/Bahan Makanan'],
    ['Cek gula darah', 'Kesehatan'], ['Sprei dan sarung bantal', 'Rumah & Kebutuhan'], ['Biaya materai elektronik', 'Biaya Keuangan'],
    ['Mainan anak', 'Belanja'], ['Kartu nama', 'Kerja'], ['Phone bill', 'Tagihan'], ['PLN Postpaid Tagihan Listrik', 'Tagihan/Listrik'],
    ['Uang saku dinas dari kantor', 'Reimbursement', 'income'], ['Bagi hasil reksadana', 'Penghasilan Keuangan', 'income'],
  ]) {
    const got = one(line, type || 'expense').label;
    assert.ok(got === want || got?.split('/')[0] === want, `${line}: ${got}`);
  }
});
