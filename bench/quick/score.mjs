/**
 * Scoring for the Catat otomatis benchmark. Engines are turned into the same shape by an adapter:
 *   { kind, amount, date, wallet, to, link, category, person, flagged: Set<field>, confident: boolean }
 * `flagged` = the fields the preview asks the person to check or fill; `confident` = the action as a whole is shown as
 * ready to save without anything highlighted.
 */
export const FIELDS = ['kind', 'amount', 'date', 'wallet', 'to', 'link', 'category', 'person'];
const empty = v => v === undefined || v === null || v === '';
const same = (field, truth, got) => truth === null ? empty(got) : field === 'person' ? String(got || '').toLowerCase() === String(truth).toLowerCase() : got === truth;

/** Truth actions matched to predicted ones: same kind and amount first, then same kind, then position. */
function align(truth, pred) {
  const used = new Set(), pairs = [];
  const pick = test => { const i = pred.findIndex((p, j) => !used.has(j) && test(p, j)); if (i >= 0) used.add(i); return i; };
  truth.forEach((t, i) => {
    let j = pick(p => p.kind === t.kind && (t.amount === undefined || p.amount === t.amount));
    if (j < 0) j = pick(p => p.kind === t.kind);
    if (j < 0) j = pick((_, k) => k === i);
    pairs.push([t, j >= 0 ? pred[j] : null]);
  });
  return { pairs, extra: pred.filter((_, j) => !used.has(j)) };
}

export function scoreCase(c, pred) {
  const { pairs, extra } = align(c.actions, pred);
  const fields = {}, review = { need: 0, flagged: 0 };
  let wrongConfident = 0, exact = pred.length === c.actions.length, unneeded = 0, askOk = 0, askNeed = 0;
  for (const [t, p] of pairs) {
    if (!p) { exact = false; continue; }
    let wrong = false;
    for (const f of FIELDS) {
      if (!(f in t)) continue;
      const ok = same(f, t[f], p[f]);
      (fields[f] ||= { ok: 0, n: 0 }).n++; if (ok) fields[f].ok++;
      if (!ok) { exact = false; if (f !== 'category' && !p.flagged.has(f)) wrong = true; }
    }
    for (const f of t.review || []) { review.need++; if (p.flagged.has(f)) review.flagged++; else exact = false; }
    // Asked for something that was right and not in doubt (category aside: it never blocks saving).
    for (const f of p.flagged) if (f !== 'category' && !(t.review || []).includes(f) && f in t && same(f, t[f], p[f]) && t[f] !== null) unneeded++;
    if (t.ask) { askNeed++; if (p.ask === t.ask) askOk++; else exact = false; }
    if (wrong && p.confident) wrongConfident++;
  }
  wrongConfident += extra.filter(p => p.confident).length;
  // Two actions for one money event: the same amount twice where the truth has it once.
  const dupMoney = pred.filter((p, i) => p.amount && pred.findIndex(q => q.amount === p.amount) !== i).length - c.actions.filter((t, i) => t.amount && c.actions.findIndex(q => q.amount === t.amount) !== i).length;
  return { id: c.id, tags: c.tags, count: pred.length === c.actions.length, exact, fields, review, extra: extra.length, missed: pairs.filter(([, p]) => !p).length, wrongConfident, unneeded, askOk, askNeed, dupMoney: Math.max(0, dupMoney) };
}

const pct = (a, b) => b ? `${Math.round(a / b * 100)}%` : '–';
export function summarize(rows) {
  const sum = { cases: rows.length, exact: 0, count: 0, extra: 0, missed: 0, wrongConfident: 0, unneeded: 0, askOk: 0, askNeed: 0, dupMoney: 0, review: { need: 0, flagged: 0 }, fields: {} };
  for (const r of rows) {
    if (r.exact) sum.exact++; if (r.count) sum.count++;
    sum.extra += r.extra; sum.missed += r.missed; sum.wrongConfident += r.wrongConfident; sum.unneeded += r.unneeded || 0; sum.askOk += r.askOk || 0; sum.askNeed += r.askNeed || 0; sum.dupMoney += r.dupMoney || 0;
    sum.review.need += r.review.need; sum.review.flagged += r.review.flagged;
    for (const [f, v] of Object.entries(r.fields)) { const s = (sum.fields[f] ||= { ok: 0, n: 0 }); s.ok += v.ok; s.n += v.n; }
  }
  const tagged = tag => rows.filter(r => r.tags.includes(tag));
  const seg = tagged('segmentation'), inherit = rows.filter(r => r.tags.includes('inheritance') || r.tags.includes('coref')), neg = tagged('negative');
  return {
    'Kalimat benar seluruhnya': pct(sum.exact, sum.cases),
    'Jumlah aksi benar': pct(sum.count, sum.cases),
    ...Object.fromEntries(FIELDS.filter(f => sum.fields[f]).map(f => [`Tepat: ${f}`, pct(sum.fields[f].ok, sum.fields[f].n)])),
    'Pemisahan kalimat benar': pct(seg.filter(r => r.count).length, seg.length),
    'Konteks bersama / rujukan benar': pct(inherit.filter(r => r.exact).length, inherit.length),
    'Kalimat bukan catatan dibiarkan': pct(neg.filter(r => r.count).length, neg.length),
    'Aksi palsu': sum.extra,
    'Aksi terlewat': sum.missed,
    'Keraguan ditandai': pct(sum.review.flagged, sum.review.need),
    'Aksi salah tapi yakin': sum.wrongConfident,
    'Relasi tepat (link/orang/arah)': (() => { const rel = rows.filter(r => r.tags.includes('relation')); return pct(rel.filter(r => r.exact).length, rel.length); })(),
    'Koreksi/pembatalan tepat': (() => { const c = rows.filter(r => r.tags.includes('correction') || r.tags.includes('negation')); return pct(c.filter(r => r.exact).length, c.length); })(),
    'Pertanyaan tepat (hanya yang kurang)': pct(sum.askOk, sum.askNeed),
    'Tanya yang tidak perlu': sum.unneeded,
    'Uang tercatat dobel': sum.dupMoney,
  };
}
