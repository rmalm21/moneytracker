"""Trains the row-link model on CORD train pairs; reports dev accuracy (all pairs and real-OCR pairs); writes the model."""
import json, sys
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.neural_network import MLPClassifier
from sklearn.preprocessing import StandardScaler

import os
S = os.environ.get('CORD_WORK', '/tmp/cord-work')
tr = json.load(open(f'{S}/rowlink-cord-train.json'))
dv = json.load(open(f'{S}/rowlink-cord-dev.json'))
Xt, yt = np.array(tr['X']), np.array(tr['y'])
Xd, yd, sd = np.array(dv['X']), np.array(dv['y']), np.array(dv['src'])
scaler = StandardScaler().fit(Xt)

def report(name, model):
    p = model.predict(scaler.transform(Xd))
    for kind in ('all', 'word', 'merged', 'ocr'):
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
