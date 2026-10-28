"""Trains the row-link model on CORD (and minimarket) train pairs; reports dev accuracy (all pairs and real-OCR pairs); writes the model."""
import json, sys
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.neural_network import MLPClassifier
from sklearn.preprocessing import StandardScaler

import os
S = os.environ.get('CORD_WORK', '/tmp/cord-work')
# 7.2: INCLUDE_MINI=1 adds the minimarket receipts (bench/minimarket). Tried for 7.2 (with 16-8, 32-16 and 48-24
# networks, several seeds and a 5-model average): none was better on both CORD and the minimarket rows, so the app keeps
# the CORD-only model; the minimarket dev pairs are still reported when they exist.
def sets(kind):
    names = ('cord', 'mini') if kind == 'dev' or os.environ.get('INCLUDE_MINI') == '1' else ('cord',)
    files = [(f'{S}/rowlink-{name}-{kind}.json', '' if name == 'cord' else 'mini-') for name in names]
    return [(json.load(open(f)), tag) for f, tag in files if os.path.exists(f)]
tr, dv = sets('train'), sets('dev')
# The minimarket receipts print many words per row; at most as many of their pairs as CORD's, so CORD keeps its weight.
if len(tr) == 2 and len(tr[1][0]['y']) > len(tr[0][0]['y']):
    keep = np.random.default_rng(7).choice(len(tr[1][0]['y']), len(tr[0][0]['y']), replace=False)
    tr[1] = ({k: [tr[1][0][k][i] for i in keep] for k in ('X', 'y', 'src')}, tr[1][1])
Xt, yt = np.concatenate([np.array(d['X']) for d, _ in tr]), np.concatenate([np.array(d['y']) for d, _ in tr])
Xd, yd = np.concatenate([np.array(d['X']) for d, _ in dv]), np.concatenate([np.array(d['y']) for d, _ in dv])
sd = np.concatenate([np.array([tag + k for k in d['src']]) for d, tag in dv])
scaler = StandardScaler().fit(Xt)

def report(name, model):
    p = model.predict(scaler.transform(Xd))
    for kind in ('all', 'word', 'merged', 'ocr', 'mini-word', 'mini-merged', 'mini-ocr'):
        m = np.ones(len(yd), bool) if kind == 'all' else sd == kind
        if not m.any():
            continue
        tp = ((p == 1) & (yd == 1) & m).sum(); fp = ((p == 1) & (yd == 0) & m).sum(); fn = ((p == 0) & (yd == 1) & m).sum()
        acc = (p[m] == yd[m]).mean()
        print(f'{name:6} {kind:6} acc {acc*100:5.1f}  precision {tp/(tp+fp)*100:5.1f}  recall {tp/(tp+fn)*100:5.1f}')

lr = LogisticRegression(max_iter=2000, C=1.0).fit(scaler.transform(Xt), yt)
report('LR', lr)
mlp = MLPClassifier(hidden_layer_sizes=(16, 8), max_iter=600, random_state=7, alpha=1e-4).fit(scaler.transform(Xt), yt)
report('MLP', mlp)

best = mlp
model = {'mean': [round(float(v), 6) for v in scaler.mean_], 'scale': [round(float(v), 6) for v in scaler.scale_],
         'layers': [{'w': [[round(float(x), 6) for x in row] for row in w], 'b': [round(float(x), 6) for x in b]} for w, b in zip(best.coefs_, best.intercepts_)]}
json.dump(model, open(f'{S}/rowlink-model.json', 'w'))
print('written', sum(len(l['w']) * len(l['w'][0]) for l in model['layers']), 'weights')
