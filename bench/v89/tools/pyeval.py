"""Score embedding models as a partner to the import rules. Usage: pyeval.py <kind> <dir> [--sets a,b] [--bench-ex]
kind: bert (onnx/model*.onnx + tokenizer.json, mean pooling), gemma (sentence_embedding output), static (model2vec)."""
import json, sys, os, time, argparse
import numpy as np, onnxruntime as ort
from tokenizers import Tokenizer
ap = argparse.ArgumentParser(); ap.add_argument('kind'); ap.add_argument('dir'); ap.add_argument('--onnx', default='onnx/model_quantized.onnx')
ap.add_argument('--sets', default='dev,dev2,heldout,heldout2,heldout3'); ap.add_argument('--bench-ex', action='store_true'); ap.add_argument('--prefix', default='e5')
ap.add_argument('--th', default=''); ap.add_argument('--show', action='store_true'); ap.add_argument('--k', type=int, default=5); ap.add_argument('--conf', default='top'); ap.add_argument('--combo', default=''); ap.add_argument('--train3', action='store_true')
a = ap.parse_args()
D = json.load(open(os.path.join(os.path.dirname(__file__), 'data.json')))
tok = Tokenizer.from_file(os.path.join(a.dir, 'tokenizer.json'))
if a.kind in ('bert', 'gemma'):
    so = ort.SessionOptions(); so.intra_op_num_threads = 4
    sess = ort.InferenceSession(os.path.join(a.dir, a.onnx), so, providers=['CPUExecutionProvider'])
    names = [i.name for i in sess.get_inputs()]
elif a.kind == 'distilled':
    Z = np.load(a.onnx); ZI = {int(i): n for n, i in enumerate(Z['ids'])}; ZV = Z['vecs']; ZW = Z['weights']
else:
    from safetensors.numpy import load_file
    E = list(load_file(os.path.join(a.dir, 'model.safetensors')).values())[0].astype(np.float32)
P = {'e5': ('query: ', 'passage: '), 'none': ('', ''), 'gemma': ('task: sentence similarity | query: ', 'task: sentence similarity | query: ')}[a.prefix]
def enc(texts, side):
    pre = P[0] if side == 'q' else P[1]; out = []
    for i in range(0, len(texts), 32):
        batch = [pre + t for t in texts[i:i + 32]]
        if a.kind == 'distilled':
            for t in batch:
                rows = [ZI[i] for i in tok.encode(t, add_special_tokens=False).ids if i in ZI]
                v = (ZV[rows] * ZW[rows, None]).sum(0) if rows else np.ones(ZV.shape[1], dtype=np.float32)
                out.append(v / (np.linalg.norm(v) + 1e-9))
            continue
        if a.kind == 'static':
            for t in batch:
                ids = tok.encode(t, add_special_tokens=False).ids or [0]
                v = E[ids].mean(0); out.append(v / (np.linalg.norm(v) + 1e-9))
            continue
        tok.enable_padding(); tok.enable_truncation(128); e = tok.encode_batch(batch)
        ids = np.array([x.ids for x in e], dtype=np.int64); mask = np.array([x.attention_mask for x in e], dtype=np.int64)
        feed = {'input_ids': ids, 'attention_mask': mask}
        if 'token_type_ids' in names: feed['token_type_ids'] = np.zeros_like(ids)
        if a.kind == 'gemma':
            res = sess.run(None, feed); outs = [o.name for o in sess.get_outputs()]
            v = res[outs.index('sentence_embedding')]
        else:
            h = sess.run(None, feed)[0]; m = mask[..., None].astype(np.float32); v = (h * m).sum(1) / m.sum(1)
        v = v / np.linalg.norm(v, axis=1, keepdims=True); out.extend(v)
    return np.array(out)
parent = lambda l: l.split('/')[0] if l else None
def wants(expect): return [e.strip().split('/', 1) for e in expect.split(' | ')]
def grade(got, expect):
    if not got: return 'none'
    w = wants(expect)
    if any(got == '/'.join(x) or (len(x) == 1 and parent(got) == x[0]) for x in w): return 'right'
    if any(parent(got) == x[0] for x in w): return 'part'
    return 'wrong'
ex = D['examples']
t0 = time.time(); X = enc([e['text'] for e in ex], 'p'); t_ex = time.time() - t0
print(f"{a.kind} {os.path.basename(a.dir.rstrip('/'))} {a.onnx if a.kind != 'static' else ''}: {len(ex)} examples in {t_ex:.1f}s")
def knn(qv, typ, exv, exl, k):
    s = exv @ qv; idx = [i for i in np.argsort(-s) if exl[i]['type'] == typ][:k]
    vote = {}
    for i in idx: p = parent(exl[i]['label']); vote.setdefault(p, [0, i]); vote[p][0] += s[i]
    best = max(vote.items(), key=lambda kv: kv[1][0])
    conf = float(s[idx[0]])
    if a.conf == 'margin':
        # How far the winning main category's best example is ahead of the best example of any other main category.
        bp = best[0]; inside = max(s[i] for i in idx if parent(exl[i]['label']) == bp)
        other = next((s[i] for i in np.argsort(-s) if exl[i]['type'] == typ and parent(exl[i]['label']) != bp), 0)
        conf = float(inside - other)
    return exl[best[1][1]]['label'], conf, [(exl[i]['text'], round(float(s[i]), 3)) for i in idx[:3]]
results = {}
for set_name in a.sets.split(','):
    items = D['sets'][set_name]; exl, exv = ex, X
    if a.bench_ex:
        extra = [dict(text=it['text'], type=it['type'], label=it['expect'].split(' | ')[0]) for sn in (('dev', 'dev2', 'heldout', 'heldout2', 'heldout3') if a.train3 else ('dev', 'dev2', 'heldout', 'heldout2')) if sn != set_name for it in D['sets'][sn]]
        exl = ex + extra; exv = np.vstack([X, enc([e['text'] for e in extra], 'p')])
    t0 = time.time(); Q = enc([it['text'] for it in items], 'q'); ms = (time.time() - t0) * 1000 / len(items)
    rows = []
    for it, qv in zip(items, Q):
        lab, conf, near = knn(qv, it['type'], exv, exl, a.k)
        rows.append(dict(it=it, lab=lab, conf=conf, near=near))
    results[set_name] = rows
    ths = [float(t) for t in a.th.split(',')] if a.th else sorted(set(round(float(np.quantile([r['conf'] for r in rows], q)), 3) for q in (0.5, 0.7, 0.85)))
    base = [grade(r['it']['rules'], r['it']['expect']) for r in rows]
    print(f"  {set_name} ({len(items)}, {ms:.1f} ms/line) rules: right {base.count('right')} wrong {base.count('wrong') + base.count('part')} none {base.count('none')}")
    for th in ths:
        emb = [grade(r['lab'] if r['conf'] >= th else None, r['it']['expect']) for r in rows]
        fb = [grade(r['it']['rules'] or (r['lab'] if r['conf'] >= th else None), r['it']['expect']) for r in rows]
        # Partner: when the model is sure and names another main category than the rules, the row is flagged to check.
        flag_bad = sum(1 for r, b in zip(rows, base) if b in ('wrong', 'part') and r['conf'] >= th and parent(r['lab']) != parent(r['it']['rules']))
        flag_good = sum(1 for r, b in zip(rows, base) if b == 'right' and r['conf'] >= th and parent(r['lab']) != parent(r['it']['rules']))
        ov = [grade(r['lab'] if (r['conf'] >= th and r['it']['rules'] and parent(r['lab']) != parent(r['it']['rules'])) else (r['it']['rules'] or (r['lab'] if r['conf'] >= th else None)), r['it']['expect']) for r in rows]
        used = sum(1 for e in emb if e != 'none')
        print(f"    th {th:.3f} | alone used {used} right {emb.count('right')} wrong {emb.count('wrong') + emb.count('part')} | fallback right {fb.count('right')} wrong {fb.count('wrong') + fb.count('part')} none {fb.count('none')} | flag rules-wrong {flag_bad}/{base.count('wrong') + base.count('part')} rules-right {flag_good}/{base.count('right')} | override right {ov.count('right')} wrong {ov.count('wrong') + ov.count('part')}")
    for pair in [x for x in a.combo.split(';') if x]:
        fth, oth = [float(v) for v in pair.split(',')]
        cb = []
        for r in rows:
            rl = r['it']['rules']; got = rl
            if not rl and r['conf'] >= fth: got = r['lab']
            elif rl and r['conf'] >= oth and parent(r['lab']) != parent(rl): got = r['lab']
            cb.append(grade(got, r['it']['expect']))
        print(f"    partner fallback>={fth} override>={oth}: right {cb.count('right')} wrong {cb.count('wrong') + cb.count('part')} none {cb.count('none')}")
    if a.show:
        for r, b in zip(rows, base):
            if b != 'right': print(f"      [{b}] {r['it']['text']} rules={r['it']['rules']} model={r['lab']} {r['conf']:.3f} near={r['near']}")
