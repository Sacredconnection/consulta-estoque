"""Validate the source CSV and prepare the Sacred-only import payload."""
import csv
import json
from pathlib import Path

source = Path('Sacred_Estoque_Minimo_3meses.csv')
items, seen = [], set()
with source.open(encoding='utf-8-sig', newline='') as stream:
    for row in csv.DictReader(stream):
        sku = row['SKU'].strip().upper()
        minimum = float(row['Estoque_minimo_3_meses'])
        if not sku or sku in seen or not minimum.is_integer() or minimum < 0:
            raise ValueError(f'Invalid or duplicate minimum: {sku}')
        seen.add(sku)
        items.append(dict(sku=sku, product=row['Produto'].strip(), variation=row['Variacao'].strip(), minimum=int(minimum)))
if not items:
    raise ValueError('Empty CSV')
Path('work').mkdir(exist_ok=True)
Path('work/sacred-minimums.json').write_text(json.dumps(dict(source=source.name, storeId='sacred', items=items), ensure_ascii=False), encoding='utf-8')
print(f'Validated {len(items)} Sacred minima. Run node --env-file=.env.local scripts/save-sacred-minimums.mjs to persist.')
