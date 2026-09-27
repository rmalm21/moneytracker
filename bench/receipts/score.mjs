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
  const items = (read.items || []).map(i => ({ name: i.name, qty: i.qty, total: i.total }));
  const used = new Set(), matches = [];
  for (const [name, qty, total] of t.items) {
    let best = -1, bestScore = 0;
    items.forEach((item, i) => { if (used.has(i)) return; const s = similar(name, item.name) + (item.total === total ? .6 : 0); if (s > bestScore) { bestScore = s; best = i; } });
    if (best >= 0 && (similar(name, items[best].name) >= .5 || (items[best].total === total && similar(name, items[best].name) >= .25))) { used.add(best); matches.push({ truth: { name, qty, total }, read: items[best] }); }
  }
  const total = check.total || read.total || 0;
  const tc = t.charges || {}, inc = new Set(check.included || []), val = k => inc.has(k) ? 0 : read[k] || 0;
  // A charge the reader marked as already inside the prices (PPN on a minimarket receipt) is not an extra charge.
  const rc = { tax: val('tax'), fees: val('service') + val('fee'), delivery: val('delivery'), discount: val('discount') };
  const tcs = { tax: tc.tax || 0, fees: (tc.service || 0) + (tc.fee || 0), delivery: tc.delivery || 0, discount: tc.discount || 0 };
  const chargeKeys = Object.keys(tcs).filter(k => tcs[k] || rc[k]);
  const times = Array.isArray(t.time) ? t.time : [t.time];
  return {
    merchant: t.merchant ? (similar(t.merchant, read.merchant) >= .85 ? 1 : 0) : null,
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
    ms: result?.ms || 0,
  };
}
export const METRICS = [['merchant', 'Merchant'], ['date', 'Tanggal'], ['time', 'Jam'], ['total', 'Grand total persis'], ['itemRecall', 'Item terdeteksi (recall)'], ['itemAmount', 'Nominal item persis'], ['qty', 'Jumlah (qty)'], ['charges', 'Biaya tambahan tepat'], ['payment', 'Cara bayar'], ['reconciled', 'Struk cocok (rekonsiliasi)']];
export function summarize(scores) {
  const avg = key => { const v = scores.map(s => s[key]).filter(x => x !== null && x !== undefined); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  const out = Object.fromEntries(METRICS.map(([k]) => [k, avg(k)]));
  out.falseItems = scores.reduce((n, s) => n + s.falseItems, 0);
  out.falseTotal = scores.reduce((n, s) => n + s.falseTotal, 0);
  out.confidentWrong = scores.reduce((n, s) => n + s.confidentWrong, 0);
  out.msAvg = avg('ms');
  return out;
}
export const pct = v => v === null ? '–' : `${(v * 100).toFixed(0)}%`;

