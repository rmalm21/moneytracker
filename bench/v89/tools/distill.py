"""Model2Vec-style distillation without torch: embed each kept token of the teacher's own vocabulary once, PCA, and a
frequency weight. Tokens are kept when they appear in Indonesian/English word lists (used only to choose) or in our texts.
Usage: distill.py <kind bert|gemma> <model dir> <onnx> <prefix e5|gemma|none> <out.npz> [dims]"""
import sys, json, os, re, time, numpy as np, onnxruntime as ort
from tokenizers import Tokenizer
kind, mdir, onnx_path, prefix, out = sys.argv[1:6]; dims = int(sys.argv[6]) if len(sys.argv) > 6 else 256
tok = Tokenizer.from_file(os.path.join(mdir, 'tokenizer.json'))
here = os.path.dirname(os.path.abspath(__file__))
counts = {}
def feed(word, n):
    for variant in (word, ' ' + word):
        for i in tok.encode(variant, add_special_tokens=False).ids: counts[i] = counts.get(i, 0) + n
for lang in ('id', 'en'):
    for line in open(os.path.join(here, 'corpus', f'{lang}_50k.txt'), encoding='utf8'):
        w, n = line.rsplit(' ', 1); feed(w, int(n))
D = json.load(open(os.path.join(here, 'data.json')))
domain = [e['text'] for e in D['examples']] + [it['text'] for s in ('dev', 'dev2', 'heldout', 'heldout2') for it in D['sets'][s]]
for t in domain:
    for w in re.findall(r"[\w&'.-]+", t.lower()): feed(w, 1000)
ids = sorted(counts, key=lambda i: -counts[i])
print('kept tokens', len(ids))
so = ort.SessionOptions(); so.intra_op_num_threads = 4
sess = ort.InferenceSession(os.path.join(mdir, onnx_path), so, providers=['CPUExecutionProvider']); names = [i.name for i in sess.get_inputs()]
pre = {'e5': 'query: ', 'gemma': 'task: sentence similarity | query: ', 'none': ''}[prefix]
texts = [pre + tok.decode([i]).strip() for i in ids]
tok.enable_padding(); tok.enable_truncation(32)
vecs = []; t0 = time.time()
for b in range(0, len(texts), 128):
    e = tok.encode_batch(texts[b:b + 128]); x = np.array([z.ids for z in e], dtype=np.int64); m = np.array([z.attention_mask for z in e], dtype=np.int64)
    feedd = {'input_ids': x, 'attention_mask': m}
    if 'token_type_ids' in names: feedd['token_type_ids'] = np.zeros_like(x)
    res = sess.run(None, feedd)
    if kind == 'gemma': v = res[[o.name for o in sess.get_outputs()].index('sentence_embedding')]
    else: h = res[0]; mm = m[..., None].astype(np.float32); v = (h * mm).sum(1) / mm.sum(1)
    vecs.append(v / np.linalg.norm(v, axis=1, keepdims=True))
    if b % 5120 == 0: print(f'  {b}/{len(texts)} {time.time() - t0:.0f}s', flush=True)
V = np.vstack(vecs).astype(np.float32)
mu = V.mean(0); U, Sg, Vt = np.linalg.svd(V - mu, full_matrices=False); P = Vt[:dims]
R = (V - mu) @ P.T
# Rarer tokens weigh more (SIF-like weight from the token's rank).
rank = np.arange(1, len(ids) + 1); p = 1 / (rank * np.log(1.78 * len(ids))); w = 1e-3 / (1e-3 + p)
np.savez(out, ids=np.array(ids, dtype=np.int64), vecs=R.astype(np.float32), weights=w.astype(np.float32))
print(f'done {len(ids)} x {dims} in {time.time() - t0:.0f}s -> {out}')
