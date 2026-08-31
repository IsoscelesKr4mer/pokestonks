"""
Top strip of each card BACK: card number (top left, under it "CHROME") and the
parallel marker (top right, under @TOPPS beside the team logo).

Per the card-intake skill, that marker is the whole Refractor test on 2026 Topps
Chrome: the word REFRACTOR under @TOPPS means Refractor, its absence means go
look at the front for an X-Fractor checkerboard. CHROME on the left is on every
card and never the tell.
"""
import os, sys, glob, re
from PIL import Image, ImageDraw
SRC = 'eBay_assets/card drop'
OUT = os.path.expanduser('~/AppData/Local/Temp/backs'); os.makedirs(OUT, exist_ok=True)

nums = sorted(int(re.search(r'IMG_(\d+)', os.path.basename(f)).group(1))
              for f in glob.glob(f'{SRC}/IMG_*.JPEG')
              if os.path.getmtime(f) > 1788100000)   # today's drop only
backs = [n for n in nums if n % 2 == 1]              # 2408 front, 2409 back
print(f'{len(nums)} photos, {len(backs)} backs')

def fname(n):
    g = glob.glob(f'{SRC}/IMG_{n}*.JPEG')
    return g[0] if g else None

PER = 4
for i in range(0, len(backs), PER):
    chunk = backs[i:i+PER]
    tiles = []
    for n in chunk:
        p = fname(n)
        if not p: continue
        im = Image.open(p); w, h = im.size
        # Full width and down to 32%: the first crop stopped above the line
        # UNDER the card number, which is exactly where CHROME and REFRACTOR
        # sit. Number and name were legible and the one thing being tested was
        # cut off.
        c = im.crop((0, int(h*0.02), w, int(h*0.32)))
        c = c.resize((1900, int(c.height*1900/c.width)), Image.LANCZOS)
        tiles.append((n, c))
    W = 1900 + 150; H = sum(t.height for _, t in tiles) + 10*len(tiles)
    sh = Image.new('RGB', (W, H), 'white'); d = ImageDraw.Draw(sh); y = 0
    for n, t in tiles:
        sh.paste(t, (150, y)); d.text((10, y + t.height//2), str(n), fill='black')
        d.line([(0, y), (W, y)], fill='#888'); y += t.height + 10
    out = f'{OUT}/backs_{chunk[0]}_{chunk[-1]}.jpg'
    sh.save(out, quality=92); print(out, sh.size)
