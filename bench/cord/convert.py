"""
CORD v2 (Clova AI, CC BY 4.0: https://github.com/clovaai/cord) -> the receipt benchmark's format.

CORD is ~1,000 real Indonesian receipts from shops and restaurants (800 train / 100 dev / 100 test), photographed, with
every word's box and text and a label per line (menu.nm, menu.cnt, menu.price, sub_total.tax_price, total.total_price,
...). Store name, address and date were removed from the labels by the publishers, so CORD measures items, charges,
totals and payment amounts, not the shop or the date.

Usage (the parquet files of https://huggingface.co/datasets/naver-clova-ix/cord-v2, folder data/):
  python bench/cord/convert.py <parquet folder> <output folder>
Writes, per split (cord-train, cord-dev, cord-test):
  <out>/<split>/<split>-0000.png ...   the images as published
  <out>/<split>.json                   truth for bench/receipts/run.mjs (score.mjs format)
  <out>/<split>-lines.json             every labelled line: words (text, box), label, group, row (for training)
Nothing here is committed: the dataset stays outside the repository.
"""
import io
import json
import os
import re
import sys

import pyarrow.parquet as pq

SPLITS = {'train': 'cord-train', 'validation': 'cord-dev', 'test': 'cord-test'}


def amount(text):
    """'75,000' / '75.000' / 'Rp 75.000,00' / '(10,000)' / '-45' -> int Rupiah (sign kept), or None."""
    if text is None:
        return None
    t = str(text).strip()
    neg = t.startswith('-') or (t.startswith('(') and t.endswith(')'))
    t = re.sub(r'(?i)rp\.?|idr', '', t)
    t = re.sub(r'[^0-9.,]', '', t)
    if not re.search(r'\d', t):
        return None
    # Two decimals after the last separator when the other separator groups thousands ("60.000,00", "60,000.00").
    m = re.match(r'^(.*\d)[.,](\d{2})$', t)
    if m and re.search(r'[.,]\d{3}$', m.group(1)):
        t = m.group(1)
    value = int(re.sub(r'[.,]', '', t)) if re.sub(r'[.,]', '', t) else None
    if value is None:
        return None
    return -value if neg else value


def count(text):
    """'2', '2x', 'x2', '2 pcs', '1.00', '@2' -> int quantity (default 1)."""
    if text is None:
        return 1
    m = re.search(r'\d+(?:[.,]\d+)?', str(text))
    if not m:
        return 1
    value = float(m.group(0).replace(',', '.'))
    return int(value) if value >= 1 and value == int(value) else max(1, round(value))


def as_list(value):
    if value is None:
        return []
    return value if isinstance(value, list) else [value]


def truth_of(parse):
    """gt_parse -> {total, items, charges, paid, change, ...} in the benchmark's format (only what is printed)."""
    items = []
    for menu in as_list(parse.get('menu')):
        if not isinstance(menu, dict):
            continue
        name = (menu.get('nm') or '').strip()
        qty = count(menu.get('cnt'))
        total = amount(menu.get('price'))
        unit = amount(menu.get('unitprice'))
        if total is None and unit is not None:
            total = unit * qty
        extra = {}
        notes, addons = [], []
        for sub in as_list(menu.get('sub')):
            if not isinstance(sub, dict):
                continue
            sub_name = (sub.get('nm') or '').strip()
            sub_price = amount(sub.get('price'))
            if sub_price:
                addons.append([sub_name, count(sub.get('cnt')), sub_price])
            elif sub_name:
                notes.append(sub_name)
        if notes:
            extra['modifiers'] = notes
        discount = amount(menu.get('discountprice'))
        if discount:
            extra['discount'] = abs(discount)
        if name and total:
            items.append([name, qty, total, extra] if extra else [name, qty, total])
        items.extend(addons)
    sub = parse.get('sub_total') or {}
    tot = parse.get('total') or {}
    if isinstance(sub, list):
        sub = sub[0] if sub else {}
    if isinstance(tot, list):
        tot = tot[0] if tot else {}
    charges = {}
    for key, field in (('tax', 'tax_price'), ('service', 'service_price'), ('fee', 'othersvc_price')):
        value = amount(sub.get(field))
        if value:
            charges[key] = abs(value)
    discount = amount(sub.get('discount_price'))
    if discount:
        charges['discount'] = abs(discount)
    out = {
        'family': 'paper',
        'total': amount(tot.get('total_price')),
        'subtotal': amount(sub.get('subtotal_price')),
        'items': items,
        'charges': charges,
    }
    for key, field in (('paid', 'cashprice'), ('change', 'changeprice'), ('card', 'creditcardprice'), ('emoney', 'emoneyprice')):
        value = amount(tot.get(field))
        if value:
            out[key] = abs(value)
    if out.get('paid') and not out.get('card') and not out.get('emoney'):
        out['payment'] = 'cash'
    return out


def box_of(quad):
    xs = [quad[k] for k in ('x1', 'x2', 'x3', 'x4')]
    ys = [quad[k] for k in ('y1', 'y2', 'y3', 'y4')]
    return [min(xs), min(ys), max(xs), max(ys)]


def main(src, dst):
    files = sorted(f for f in os.listdir(src) if f.endswith('.parquet'))
    seen = {name: 0 for name in SPLITS.values()}
    truth = {name: {} for name in SPLITS.values()}
    lines = {name: {} for name in SPLITS.values()}
    for file in files:
        split = next((v for k, v in SPLITS.items() if file.startswith(k)), None)
        if not split:
            continue
        os.makedirs(os.path.join(dst, split), exist_ok=True)
        table = pq.read_table(os.path.join(src, file))
        for row in table.to_pylist():
            gt = json.loads(row['ground_truth'])
            data = row['image']['bytes']
            ext = 'png' if data[:4] == b'\x89PNG' else 'jpg'
            name = f'{split}-{seen[split]:04d}.{ext}'
            seen[split] += 1
            with open(os.path.join(dst, split, name), 'wb') as handle:
                handle.write(data)
            t = truth_of(gt.get('gt_parse') or {})
            t['source'] = {'dataset': 'CORD v2', 'split': gt.get('meta', {}).get('split'), 'image_id': gt.get('meta', {}).get('image_id')}
            truth[split][name] = t
            lines[split][name] = {
                'size': gt.get('meta', {}).get('image_size'),
                'roi': gt.get('roi') or None,
                'lines': [{
                    'label': line.get('category'), 'group': line.get('group_id'), 'sub': line.get('sub_group_id'),
                    'words': [{'text': w.get('text', ''), 'box': box_of(w['quad']), 'row': w.get('row_id'), 'key': w.get('is_key', 0)} for w in line.get('words', [])],
                } for line in gt.get('valid_line', [])],
            }
    for split in SPLITS.values():
        if not truth[split]:
            continue
        with open(os.path.join(dst, f'{split}.json'), 'w') as handle:
            json.dump(truth[split], handle, ensure_ascii=False, indent=1)
        with open(os.path.join(dst, f'{split}-lines.json'), 'w') as handle:
            json.dump(lines[split], handle, ensure_ascii=False)
        print(split, len(truth[split]), 'images')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
