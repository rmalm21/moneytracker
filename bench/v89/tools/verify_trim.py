import json, sys, numpy as np, onnxruntime as ort
from tokenizers import Tokenizer
src, dst = sys.argv[1:3]
D = json.load(open('data.json'))
P = 'task: sentence similarity | query: '
texts = [e['text'] for e in D['examples']] + [it['text'] for s in D['sets'].values() for it in s]
extra = ['Gaji bulan November', 'Transfer ke rekening tabungan', 'Pembayaran QRIS warung kopi', 'Weekly groceries at the supermarket', 'Ngopi sore bareng temen kantor', 'Beli bensin full tank', 'TRSF E-BANKING DB 0811 QRIS KOPI KENANGAN', 'Tagihan listrik pascabayar', 'Ongkir paket dari marketplace', 'BIAYA ADM', 'Pembelian Pulsa Telkomsel 50rb', 'Ayam geprek level 5']
A = Tokenizer.from_file(f'{src}/tokenizer.json'); B = Tokenizer.from_file(f'{dst}/tokenizer.json')
old_ids = json.load(open(f'{dst}/id_map.json'))['old_ids']
diff = [t for t in texts + extra if [old_ids[i] for i in B.encode(P + t).ids] != A.encode(P + t).ids]
print(f'tokenized the same: {len(texts) + len(extra) - len(diff)}/{len(texts) + len(extra)}', diff[:5])
so = ort.SessionOptions(); so.intra_op_num_threads = 4
def emb(path, tok, xs):
    s = ort.InferenceSession(path, so, providers=['CPUExecutionProvider']); out = []
    for t in xs:
        e = tok.encode(P + t); out.append(s.run(None, {'input_ids': np.array([e.ids], dtype=np.int64), 'attention_mask': np.array([e.attention_mask], dtype=np.int64)})[1][0])
    return np.array(out)
sample = texts[::9] + extra
ea = emb(f'{src}/onnx/model_q4.onnx', A, sample); eb = emb(f'{dst}/onnx/model_q4.onnx', B, sample)
cos = (ea * eb).sum(1) / np.linalg.norm(ea, axis=1) / np.linalg.norm(eb, axis=1)
print(f'embedding agreement on {len(sample)} lines: min cos {cos.min():.6f}, mean {cos.mean():.6f}')
