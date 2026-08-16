"""
Montage of a single box rip, shareable on X.

  python scripts/build_rip_montage.py

v2, rebuilt to Michael's note 2026-08-14: "I just want like a nice visual and
all your text just make it look like ai slop". So the copy is gone. No header
block, no card counts, no handle, no descriptive blurbs. The cards carry it.
The only words left are two MVP BUYBACK tags, which are the one thing the
picture cannot say on its own.

Three tiers:
  HERO  Bobby Witt Jr Static Noise SN-8, red frame, tagged 1:1,175 MEGA PACKS.
        I first said the odds could not be found and left the claim off the
        image. Michael: "odds are literally on the beckett cheklist". He was
        right, and I already had lib/services/beckett.ts built for exactly
        this, so a web search was the wrong tool. Beckett gives Static Noise as
        15 cards, Value 1:3,924 and Mega 1:1,175. That is a hard number, so it
        goes on the graphic instead of a vague blurb.
  GOLD  Pete Crow-Armstrong and Shohei Ohtani, gold frames. Both live Topps
        MVP buyback candidates, close in NL MVP odds per Michael.
  GRID  the remaining 20.

Cards are photographed on acrylic stands against a dark backdrop, so each is
auto-cropped: threshold on brightness+saturation, drop the bottom of the frame
(stand plus lit desk), then bound by the dominant column/row profile. A naive
getbbox pulled in the desk.
"""
from PIL import Image, ImageDraw, ImageFont
import numpy as np
import os

SRC = 'eBay_assets/card drop'
OUT = 'eBay_assets/toppschrome_mega_rip_2026-08-13.png'

HERO = 'IMG_1449.JPEG'                      # Bobby Witt Jr, Static Noise
GOLD = ['IMG_1442.JPEG', 'IMG_1444.JPEG']   # Pete Crow-Armstrong, Shohei Ohtani
BOX = 'IMG_1493.JPEG'
# Tried the box centred under the grid on 2026-08-14. Michael: "nvm that makes
# it look awkward". Off by default; flip to True if a future rip wants it.
SHOW_BOX = False
FRONTS = [
    'IMG_1463.JPEG',  # Roman Anthony Wrecking Crew RC
    'IMG_1461.JPEG',  # Bryce Harper Big Ticket Player
    'IMG_1465.JPEG',  # Past to Present, Gonzalez / Carroll
    'IMG_1457.JPEG',  # Mookie Betts 1989
    'IMG_1459.JPEG',  # Roman Anthony 1989 RC
    'IMG_1483.JPEG',  # Cal Raleigh X-Fractor
    'IMG_1451.JPEG',  # Cole Young RC
    'IMG_1469.JPEG',  # Carson Williams RC
    'IMG_1455.JPEG',  # Troy Melton RC
    'IMG_1471.JPEG',  # Denzer Guzman RC
    'IMG_1485.JPEG',  # Kyle Karros RC X-Fractor
    'IMG_1477.JPEG',  # Zach Maxwell RC X-Fractor
    'IMG_1491.JPEG',  # Brady House X-Fractor
    'IMG_1489.JPEG',  # Hurston Waldrep X-Fractor
    'IMG_1487.JPEG',  # Cole Ragans X-Fractor
    'IMG_1481.JPEG',  # Jonathan Aranda X-Fractor
    'IMG_1479.JPEG',  # Tatsuya Imai X-Fractor
    'IMG_1473.JPEG',  # Nico Hoerner X-Fractor
    'IMG_1475.JPEG',  # Gabriel Moreno X-Fractor
    'IMG_1453.JPEG',  # Lars Nootbaar
]

W = 1600
MARGIN = 70
BG = (12, 14, 19)
RED = (228, 40, 46)
GOLDC = (212, 172, 62)
MUTED = (120, 128, 142)

HERO_W = 1010
GOLD_W = 300
GRID_COLS, CARD_W, CARD_H, GAP = 5, 232, 322, 26


def font(sz, bold=True):
    for p in ([r'C:\Windows\Fonts\arialbd.ttf'] if bold else []) + [r'C:\Windows\Fonts\arial.ttf']:
        try:
            return ImageFont.truetype(p, sz)
        except Exception:
            pass
    return ImageFont.load_default()


def crop_card(path):
    im = Image.open(path).convert('RGB')
    hsv = np.asarray(im.convert('HSV')).astype(int)
    sat, val = hsv[:, :, 1], hsv[:, :, 2]
    mask = (val > 100) & ((sat > 40) | (val > 170))
    mask[int(mask.shape[0] * 0.86):, :] = False
    cols, rows = mask.sum(0), mask.sum(1)
    if not cols.max() or not rows.max():
        return im
    cs = np.where(cols > cols.max() * 0.30)[0]
    rs = np.where(rows > rows.max() * 0.30)[0]
    pad = 10
    return im.crop((max(0, cs.min() - pad), max(0, rs.min() - pad),
                    min(im.size[0], cs.max() + pad), min(im.size[1], rs.max() + pad)))


def fit(im, bw, bh):
    im = im.copy()
    im.thumbnail((bw, bh), Image.LANCZOS)
    return im


def place(canvas, im, x, y, frame=None, width=4):
    sh = Image.new('RGBA', (im.size[0] + 10, im.size[1] + 10), (0, 0, 0, 130))
    canvas.paste(sh, (x - 5, y - 2), sh)
    canvas.paste(im, (x, y))
    if frame:
        ImageDraw.Draw(canvas).rectangle(
            [x - 9, y - 9, x + im.size[0] + 8, y + im.size[1] + 8], outline=frame, width=width)


def main():
    hero = fit(crop_card(os.path.join(SRC, HERO)), HERO_W, 760)
    golds = [fit(crop_card(os.path.join(SRC, g)), GOLD_W, 420) for g in GOLD]

    gold_h = sum(g.size[1] for g in golds) + 46 + 34   # +34 for the tag strip
    top_h = max(hero.size[1] + 54, gold_h)             # +54 for the hero caption line
    box = fit(crop_card(os.path.join(SRC, BOX)), 360, 430) if SHOW_BOX else None
    grid_rows = -(-len(FRONTS) // GRID_COLS)
    grid_h = grid_rows * CARD_H + (grid_rows - 1) * GAP
    H = MARGIN + top_h + 78 + grid_h + MARGIN + (74 + box.size[1] if box else 0)

    c = Image.new('RGB', (W, H), BG)
    d = ImageDraw.Draw(c)

    # top tier: hero left, the two gold cards stacked right
    block_w = hero.size[0] + 54 + GOLD_W
    x0 = (W - block_w) // 2
    hy0 = MARGIN + (top_h - hero.size[1]) // 2
    place(c, hero, x0, hy0, RED, 5)
    # the one number worth printing, straight off the Beckett odds table
    d.text((x0, hy0 + hero.size[1] + 20), 'STATIC NOISE', font=font(30), fill=RED)
    d.text((x0 + hero.size[0], hy0 + hero.size[1] + 22),
           '1:1,175 MEGA PACKS', font=font(26), fill=MUTED, anchor='ra')

    gx = x0 + hero.size[0] + 54
    gy = MARGIN + (top_h - gold_h) // 2
    for g in golds:
        gxx = gx + (GOLD_W - g.size[0]) // 2
        place(c, g, gxx, gy, GOLDC, 4)
        t = 'MVP BUYBACK'
        tw = d.textlength(t, font=font(19))
        d.text((gxx + (g.size[0] - tw) / 2, gy + g.size[1] + 16), t, font=font(19), fill=GOLDC)
        gy += g.size[1] + 46 + 17

    # grid
    ty = MARGIN + top_h + 78
    gx0 = (W - (GRID_COLS * CARD_W + (GRID_COLS - 1) * GAP)) // 2
    for i, f in enumerate(FRONTS):
        im = fit(crop_card(os.path.join(SRC, f)), CARD_W, CARD_H)
        x = gx0 + (i % GRID_COLS) * (CARD_W + GAP) + (CARD_W - im.size[0]) // 2
        y = ty + (i // GRID_COLS) * (CARD_H + GAP) + (CARD_H - im.size[1]) // 2
        place(c, im, x, y)

    if box:
        place(c, box, (W - box.size[0]) // 2, ty + grid_h + 74)

    c.save(OUT)
    print('saved', OUT, c.size)


if __name__ == '__main__':
    main()
