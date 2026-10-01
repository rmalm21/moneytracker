/** Field-level scoring of a receipt reading against the truth (used by run.mjs). */
const squash = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const bigrams = s => { const t = squash(s), set = []; for (let i = 0; i < t.length - 1; i++) set.push(t.slice(i, i + 2)); return set; };
function similar(a, b) {
  const x = bigrams(a), y = bigrams(b); if (!x.length || !y.length) return squash(a) === squash(b) ? 1 : 0;
  const pool = [...y]; let hit = 0; for (const g of x) { const i = pool.indexOf(g); if (i >= 0) { hit++; pool.splice(i, 1); } }
  return 2 * hit / (x.length + y.length);
}

/** Field-level scores of one reading. */
export function score(t, result) {
  const read = result?.read || {}, check = result?.check || {};
  const items = (read.items || []).map(i => ({ name: i.name, qty: i.qty, total: i.total, modifiers: i.modifiers || [], unsure: i.modifiersUnsure || [], discount: i.discount || 0, variant: i.variant, variantUnsure: i.variantUnsure, sku: i.sku }));
  const used = new Set(), matches = [];
  for (const [name, qty, total, extra = {}] of t.items) {
    let best = -1, bestScore = 0;
    items.forEach((item, i) => { if (used.has(i)) return; const s = similar(name, item.name) + (item.total === total ? .6 : 0); if (s > bestScore) { bestScore = s; best = i; } });
    if (best >= 0 && (similar(name, items[best].name) >= .5 || (items[best].total === total && similar(name, items[best].name) >= .25))) { used.add(best); matches.push({ truth: { name, qty, total, ...extra }, read: items[best] }); }
  }
  // Relations (V2.5): who owns each modifier and item discount, the variant/SKU under an item, the company and outlet.
  // A wrong relation the reader did not mark for checking counts as confidently wrong.
  const rel = { ok: 0, all: 0, wrong: 0 }, same = (a, b) => squash(a) === squash(b), relTruth = t.items.some(i => i[3]) || t.legal || t.branch;
  const check1 = (good, flagged = false) => { rel.all++; if (good) rel.ok++; else if (!flagged) rel.wrong++; };
  if (relTruth) {
    for (const m of matches) {
      const want = m.truth.modifiers || [], got = m.read.modifiers;
      for (const note of want) check1(got.some(g => similar(g, note) >= .7));
      for (const note of got) if (!want.some(w => similar(w, note) >= .7)) check1(false, m.read.unsure.includes(note));
      if (m.truth.discount || m.read.discount) check1(m.truth.discount === m.read.discount);
      if (m.truth.variant || m.read.variant) check1(same(m.truth.variant, m.read.variant), m.read.variantUnsure);
      if (m.truth.sku || m.read.sku) check1(same(m.truth.sku, m.read.sku));
    }
    if (t.legal || read.legalEntity) check1(similar(t.legal, read.legalEntity) >= .85);
    if (t.branch || read.branch) check1(similar(t.branch, read.branch) >= .85);
  }
  const total = check.total || read.total || 0;
  const tc = t.charges || {}, inc = new Set(check.included || []), val = k => inc.has(k) ? 0 : read[k] || 0;
  // A charge the reader marked as already inside the prices (PPN on a minimarket receipt) is not an extra charge.
  const rc = { tax: val('tax'), fees: val('service') + val('fee'), delivery: val('delivery'), discount: val('discount') };
  const tcs = { tax: tc.tax || 0, fees: (tc.service || 0) + (tc.fee || 0), delivery: tc.delivery || 0, discount: tc.discount || 0 };
  const chargeKeys = Object.keys(tcs).filter(k => tcs[k] || rc[k]);
  const times = Array.isArray(t.time) ? t.time : [t.time];
  return {
    merchant: t.merchant ? ([t.merchant, ...(t.merchantAlt || [])].some(m => similar(m, read.merchant) >= .85) ? 1 : 0) : null,
    date: t.date ? (read.date === t.date ? 1 : 0) : null,
    time: t.time ? (times.includes(read.time) ? 1 : 0) : null,
    total: total === t.total ? 1 : 0,
    itemRecall: matches.length / t.items.length,
    itemAmount: matches.filter(m => m.read.total === m.truth.total).length / t.items.length,
    qty: matches.length ? matches.filter(m => m.read.qty === m.truth.qty).length / matches.length : null,
    charges: chargeKeys.length ? chargeKeys.filter(k => rc[k] === tcs[k]).length / chargeKeys.length : null,
    payment: t.payment ? (read.payment === t.payment ? 1 : 0) : null,
    reconciled: check.matches ? 1 : 0,
    falseItems: items.length - used.size,
    falseTotal: total && total !== t.total ? 1 : 0,
    confidentWrong: total !== t.total && check.confidence === 'tinggi' ? 1 : 0,
    relations: rel.all ? rel.ok / rel.all : null,
    // V3 safety: a forbidden text (address, phone, payment, help button) read as an item.
    phantomForbidden: (t.forbidden || []).filter(f => items.some(i => squash(i.name).includes(squash(f)))).length,
    originalAsPaid: t.items.filter(i => i[3]?.originalPrice && items.some(r => r.total === i[3].originalPrice * i[1])).length,
    relWrong: rel.wrong,
    ms: result?.ms || 0,
    passes: result?.passes || 0,
  };
}
export const METRICS = [['merchant', 'Merchant'], ['date', 'Tanggal'], ['time', 'Jam'], ['total', 'Grand total persis'], ['itemRecall', 'Item terdeteksi (recall)'], ['itemAmount', 'Nominal item persis'], ['qty', 'Jumlah (qty)'], ['charges', 'Biaya tambahan tepat'], ['payment', 'Cara bayar'], ['reconciled', 'Struk cocok (rekonsiliasi)'], ['relations', 'Relasi tepat (modifier/diskon/SKU)']];
export function summarize(scores) {
  const avg = key => { const v = scores.map(s => s[key]).filter(x => x !== null && x !== undefined); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  const out = Object.fromEntries(METRICS.map(([k]) => [k, avg(k)]));
  out.falseItems = scores.reduce((n, s) => n + s.falseItems, 0);
  out.falseTotal = scores.reduce((n, s) => n + s.falseTotal, 0);
  out.confidentWrong = scores.reduce((n, s) => n + s.confidentWrong, 0);
  out.relWrong = scores.reduce((n, s) => n + (s.relWrong || 0), 0);
  out.phantomForbidden = scores.reduce((n, s) => n + (s.phantomForbidden || 0), 0);
  out.originalAsPaid = scores.reduce((n, s) => n + (s.originalAsPaid || 0), 0);
  out.msAvg = avg('ms');
  out.passesAvg = avg('passes');
  out.escalated = scores.length ? scores.filter(s => s.passes > 1).length / scores.length : null;
  return out;
}
export const pct = v => v === null ? '–' : `${(v * 100).toFixed(0)}%`;

