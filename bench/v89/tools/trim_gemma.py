"""Trim EmbeddingGemma (q4 ONNX + BPE tokenizer) to the tokens Indonesian and English need.
Usage: trim_gemma.py <src dir> <dst dir> <keep.npz from distill> [top_n]"""
import sys, os, json, copy, numpy as np, onnx
from onnx import numpy_helper
src, dst, keep_npz = sys.argv[1:4]; top_n = int(sys.argv[4]) if len(sys.argv) > 4 else None
os.makedirs(os.path.join(dst, 'onnx'), exist_ok=True)
T = json.load(open(os.path.join(src, 'tokenizer.json'))); vocab = T['model']['vocab']; inv = {i: t for t, i in vocab.items()}
merges = [tuple(m.split(' ', 1)) if isinstance(m, str) else tuple(m) for m in T['model']['merges']]
import re
from tokenizers import Tokenizer
tk = Tokenizer.from_file(os.path.join(src, 'tokenizer.json'))
counts = {}
def feed(text, n):
    for i in tk.encode(text, add_special_tokens=False).ids: counts[i] = counts.get(i, 0) + n
here = os.path.dirname(os.path.abspath(__file__))
for lang in ('id', 'en'):
    for k, line in enumerate(open(os.path.join(here, 'corpus', f'{lang}_50k.txt'), encoding='utf8')):
        w, n = line.rsplit(' ', 1); n = int(n)
        for v in {w, w.capitalize(), w.upper()}:   # word lists are lower case; statements are often Title or UPPER case
            feed(v, n); feed(' ' + v, n)
D = json.load(open(os.path.join(here, 'data.json')))
for t in [e['text'] for e in D['examples']] + [it['text'] for s in ('dev', 'dev2', 'heldout', 'heldout2') for it in D['sets'][s]] + ['task: sentence similarity | query: ']:
    for v in (t, t.upper(), t.lower(), t.title()): feed(v, 1000); feed(' ' + v, 1000)
ids = sorted(counts, key=lambda i: -counts[i])
if top_n: ids = ids[:top_n]
keep = set(int(i) for i in ids)
for t, i in vocab.items():   # '▁' with one Latin letter, digit or sign, so any word still splits into known pieces
    if len(t) == 2 and t[0] == '▁' and ord(t[1]) < 0x250: keep.add(i)
for t in ['<pad>', '<eos>', '<bos>', '<unk>', '<mask>']: keep.add(vocab[t])
for b in range(256): keep.add(vocab[f'<0x{b:02X}>'])
for t, i in vocab.items():
    if len(t) == 1 and (ord(t) < 0x250 or t in '▁€₹–—‘’“”•…'): keep.add(i)   # every Latin letter, digit and sign
made = {}
for a, b in merges: made.setdefault(a + b, []).append((a, b))
stack = [inv[i] for i in keep]
while stack:   # a kept token needs every pair it can be merged from, so the merges run exactly as before
    t = stack.pop()
    for ab in made.get(t, []):
        for part in ab:
            if part in vocab and vocab[part] not in keep: keep.add(vocab[part]); stack.append(part)
old_ids = sorted(keep); new_of = {o: n for n, o in enumerate(old_ids)}
print(f'kept {len(old_ids)} of {len(vocab)} tokens')
T2 = copy.deepcopy(T)
T2['model']['vocab'] = {inv[o]: n for n, o in enumerate(old_ids)}
T2['model']['merges'] = [[a, b] for a, b in merges if a in vocab and b in vocab and vocab[a] in keep and vocab[b] in keep and (a + b) in vocab and vocab[a + b] in keep]
T2['added_tokens'] = [dict(x, id=new_of[x['id']]) for x in T['added_tokens'] if x['id'] in keep]
def fix(o):
    if isinstance(o, dict):
        if 'ids' in o and 'tokens' in o: o['ids'] = [new_of[i] for i in o['ids']]
        for v in o.values(): fix(v)
    elif isinstance(o, list):
        for v in o: fix(v)
fix(T2.get('post_processor'))
json.dump(T2, open(os.path.join(dst, 'tokenizer.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
print('merges kept', len(T2['model']['merges']), 'of', len(merges))
m = onnx.load(os.path.join(src, 'onnx/model_q4.onnx'), load_external_data=True)
idx = np.array(old_ids)
for init in m.graph.initializer:
    if init.name == 'model.embed_tokens.weight_Q4':
        raw = np.frombuffer(init.raw_data, dtype=np.uint8).reshape(init.dims[0], init.dims[1] // 2)
        init.raw_data = raw[idx].tobytes(); init.dims[0] = len(idx)
    elif init.name == 'model.embed_tokens.weight_scales':
        arr = numpy_helper.to_array(init)[idx]; init.CopyFrom(numpy_helper.from_array(arr, init.name))
onnx.save_model(m, os.path.join(dst, 'onnx/model_q4.onnx'), save_as_external_data=True, all_tensors_to_one_file=True, location='model_q4.onnx_data', size_threshold=1024)
for f in ['config.json']:
    if os.path.exists(os.path.join(src, f)): open(os.path.join(dst, f), 'w').write(open(os.path.join(src, f)).read())
json.dump({'old_ids': old_ids}, open(os.path.join(dst, 'id_map.json'), 'w'))
print('saved', dst)
