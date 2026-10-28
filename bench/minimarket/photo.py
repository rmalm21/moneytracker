"""Photographs the flat receipts of build.mjs as a phone would: thermal ink faded unevenly, paper curled and crumpled,
the phone held at an angle, a table under the paper, uneven light, a hand's shadow or glare, focus blur, noise and
JPEG. Every word box goes through the same mapping, so the boxes stay true.
Usage: python photo.py <flat dir> <out dir> <lines.json> <seed>"""
import json
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

flat, out, lines_path, seed = sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4])
words = json.load(open(os.path.join(flat, 'words.json')))
rng = np.random.default_rng(seed)
LEVELS = {  # rotation (deg), tilt, bow and crumple (line heights), faded ink floor, blur, noise, JPEG, paper size in frame
    'easy': dict(rot=3, tilt=.05, bow=.1, crumple=.05, fade=.8, blur=.6, noise=.015, jpeg=(75, 92), frac=(.75, .93), shadow=.1, glare=.05, motion=0, lowres=0),
    'medium': dict(rot=7, tilt=.12, bow=.35, crumple=.15, fade=.55, blur=1.2, noise=.03, jpeg=(60, 85), frac=(.65, .9), shadow=.3, glare=.15, motion=.1, lowres=.1),
    'hard': dict(rot=12, tilt=.2, bow=.7, crumple=.3, fade=.35, blur=1.8, noise=.045, jpeg=(45, 75), frac=(.55, .85), shadow=.5, glare=.25, motion=.2, lowres=.3),
}


def field(h, w, gy, gx):
    """A smooth random field in [0, 1], h x w, from a gy x gx grid of random values."""
    g = rng.random((gy, gx))
    ys, xs = np.linspace(0, gy - 1, h), np.linspace(0, gx - 1, w)
    return ndimage.map_coordinates(g, np.meshgrid(ys, xs, indexing='ij'), order=3, mode='nearest').clip(0, 1)


def background(H, W):
    kind = rng.choice(['wood', 'grey', 'light', 'dark', 'cloth'], p=[.3, .25, .15, .15, .15])
    base = {'wood': [.48, .33, .2], 'grey': [.5, .5, .52], 'light': [.82, .8, .76], 'dark': [.13, .12, .12], 'cloth': [.25, .3, .42]}[kind]
    base = np.array(base) * rng.uniform(.8, 1.15)
    tex = field(H, W, 60, 4) * .35 + field(H, W, 6, 6) * .25 if kind == 'wood' else field(H, W, 5, 5) * .25 + rng.normal(0, .03, (H, W))
    return (base[None, None, :] * (.8 + tex[..., None])).clip(0, 1)


def homography(src, dst):
    a = []
    for (x, y), (u, v) in zip(src, dst):
        a += [[x, y, 1, 0, 0, 0, -u * x, -u * y], [0, 0, 0, x, y, 1, -v * x, -v * y]]
    hv = np.linalg.solve(np.array(a, float), np.array(dst, float).reshape(-1))
    return np.append(hv, 1).reshape(3, 3)


def apply(hm, x, y):
    d = hm[2, 0] * x + hm[2, 1] * y + hm[2, 2]
    return (hm[0, 0] * x + hm[0, 1] * y + hm[0, 2]) / d, (hm[1, 0] * x + hm[1, 1] * y + hm[1, 2]) / d


lines_out = {}
for name in sorted(words):
    info = words[name]
    level = rng.choice(['easy', 'medium', 'hard'], p=[.35, .45, .2])
    L = LEVELS[level]
    paper = np.asarray(Image.open(os.path.join(flat, f'{name}.png')).convert('RGB'), dtype=np.float32) / 255
    h, w = paper.shape[:2]
    lh = float(np.median([b['box'][3] - b['box'][1] for b in info['words']]) or 40)
    # Thermal ink fades unevenly; the paper is a little yellow.
    floor = rng.uniform(L['fade'], 1)
    fade = floor + (1 - floor) * field(h, w, max(2, int(h / 300)), 3)
    paper = 1 - (1 - paper) * fade[..., None]
    paper *= np.array([1, .985, .95]) * rng.uniform(.9, 1)
    # Frame, size and place.
    H, W = (2133, 1200) if h / w > 2.4 else (1600, 1200)
    frac = rng.uniform(*L['frac'])
    s = min(frac * H / h, frac * W / w)
    cx, cy = W / 2 + rng.uniform(-.05, .05) * W, H / 2 + rng.uniform(-.04, .04) * H
    th = np.radians(rng.uniform(-L['rot'], L['rot']))
    corners = np.array([[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]]) * s
    # Held tilted along the paper (top further away) up to the level's tilt; sideways much less: a narrow receipt seen
    # 20 degrees from the side is only about 4% taller on the near edge.
    k, side = rng.uniform(0, L['tilt']), rng.uniform(-L['tilt'] / 5, L['tilt'] / 5)
    corners[0, 0] *= 1 - k; corners[1, 0] *= 1 - k; corners[:2, 1] *= 1 - k / 2  # top edge further away
    corners[[0, 3], 1] *= 1 + side; corners[[1, 2], 1] *= 1 - side
    rot = np.array([[np.cos(th), -np.sin(th)], [np.sin(th), np.cos(th)]])
    dst = corners @ rot.T + [cx, cy]
    hm = homography([[0, 0], [w, 0], [w, h], [0, h]], dst.tolist())
    hinv = np.linalg.inv(hm)
    # Curl (rows bow) and crumple (small waves), in paper pixels.
    bow = rng.uniform(-L['bow'], L['bow']) * lh
    gy, gx = max(3, int(h / (lh * 6))), 4
    cdx, cdy = (rng.random((gy, gx)) - .5) * 2 * L['crumple'] * lh, (rng.random((gy, gx)) - .5) * 2 * L['crumple'] * lh

    def disp(px, py):
        gyc, gxc = (py / h * (gy - 1)).clip(0, gy - 1), (px / w * (gx - 1)).clip(0, gx - 1)
        dx = ndimage.map_coordinates(cdx, [gyc, gxc], order=1, mode='nearest')
        dy = ndimage.map_coordinates(cdy, [gyc, gxc], order=1, mode='nearest') + bow * ((px - w / 2) / (w / 2)) ** 2
        return dx, dy
    qy, qx = np.mgrid[0:H, 0:W].astype(np.float32)
    sx, sy = apply(hinv, qx, qy)
    px, py = sx.copy(), sy.copy()
    for _ in range(5):
        dx, dy = disp(px, py)
        px, py = sx - dx, sy - dy
    img = np.stack([ndimage.map_coordinates(paper[..., c], [py, px], order=1, cval=1) for c in range(3)], -1)
    mask = ndimage.map_coordinates(np.ones((h, w), np.float32), [py, px], order=1, cval=0)[..., None]
    bg = background(H, W)
    shadow = ndimage.gaussian_filter(ndimage.shift(mask[..., 0], (rng.uniform(4, 18), rng.uniform(-10, 10)), order=1), rng.uniform(6, 18))
    bg *= (1 - .45 * shadow)[..., None]
    img = bg * (1 - mask) + img * mask
    # Light: uneven, a hand's shadow, glare, colour of the room.
    img *= (.72 + .38 * field(H, W, 3, 3))[..., None]
    if rng.random() < L['shadow']:
        a = rng.uniform(0, 2 * np.pi); off = rng.uniform(-.2, .3) * W
        edge = (qx - W / 2) * np.cos(a) + (qy - H / 2) * np.sin(a) - off
        img *= (1 - rng.uniform(.3, .55) * ndimage.gaussian_filter((edge > 0).astype(np.float32), rng.uniform(4, 30)))[..., None]
    if rng.random() < L['glare']:
        gx0, gy0, r0 = rng.uniform(.3, .7) * W, rng.uniform(.3, .7) * H, rng.uniform(.08, .2) * W
        g = np.exp(-(((qx - gx0) / r0) ** 2 + ((qy - gy0) / (r0 * .6)) ** 2))
        img += rng.uniform(.4, .9) * g[..., None] * (1 - img)
    img *= np.array([1 + rng.uniform(0, .06), 1, 1 - rng.uniform(0, .1)])
    # Camera: focus, shake, noise, resolution, JPEG.
    sigma = rng.uniform(0, L['blur'])
    if sigma > .2:
        img = ndimage.gaussian_filter(img, (sigma, sigma, 0))
    if rng.random() < L['motion']:
        n = int(rng.integers(3, 9)); kern = np.zeros((n, n)); kern[n // 2, :] = 1 / n
        kern = ndimage.rotate(kern, rng.uniform(0, 180), reshape=False, order=1); kern /= kern.sum()
        img = np.stack([ndimage.convolve(img[..., c], kern, mode='nearest') for c in range(3)], -1)
    img = (img + rng.normal(0, rng.uniform(.005, L['noise']), img.shape)).clip(0, 1)
    pic = Image.fromarray((img * 255).astype(np.uint8))
    if rng.random() < L['lowres']:
        f = rng.uniform(.4, .65); pic = pic.resize((int(W * f), int(H * f)), Image.BILINEAR).resize((W, H), Image.BILINEAR)
    pic.save(os.path.join(out, f'{name}.jpg'), quality=int(rng.integers(*L['jpeg'])))
    # Word boxes through the same mapping.
    rows = {}
    for wd in info['words']:
        if not wd['text'].strip('-=_'):
            continue  # printed rules are not words (CORD does not label them either)
        x0, y0, x1, y1 = wd['box']
        cx_, cy_ = np.array([x0, x1, x1, x0], float), np.array([y0, y0, y1, y1], float)
        dx, dy = disp(cx_, cy_)
        u, v = apply(hm, cx_ + dx, cy_ + dy)
        rows.setdefault(wd['row'], []).append({'text': wd['text'], 'box': [int(u.min()), int(v.min()), int(np.ceil(u.max())), int(np.ceil(v.max()))], 'row': wd['row'], 'key': 0})
    lines_out[f'{name}.jpg'] = {'size': {'width': W, 'height': H}, 'roi': None, 'level': level, 'lines': [{'label': '', 'group': r, 'sub': 0, 'words': ws} for r, ws in sorted(rows.items())]}
    print(name, level, flush=True)
json.dump(lines_out, open(lines_path, 'w'))
