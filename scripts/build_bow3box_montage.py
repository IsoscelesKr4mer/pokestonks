"""
Card montages for the three-mega 2026 Bowman Chrome rip, one image per box.

  python scripts/build_bow3box_montage.py

The two data cards carry the numbers. These carry the cards, which is what
Michael asked for after seeing the first pass: "You didnt include the actual
cards lie on the thread though - people want to see the hits! You can stack the
base non rookies in and just label it how many base cards like a fanned stack".

So per box:
  TOP    the three best cards of that box, large, with a one-line tag each
  GRID   every other parallel, insert, rookie and 1st Bowman
  FAN    the plain base veterans collapsed into one overlapping fanned stack
         with a count, because nobody wants to look at nine Bo Bichettes

Text stays minimal per his standing note on the 08-13 montage ("all your text
just make it look like ai slop"). The only words are the box number, its book
value, the three hero tags and the fan count.

Selection comes from scripts/_bow3box_montage.json, built off
_bow3box_cards.json and the per-box comp files, so the cards shown here are the
same cards the data card prices. `plain` means base parallel, no RC, no 1st
Bowman logo, which is exactly the set that goes in the fan.

Cards are shot portrait on an acrylic stand against a dark backdrop, the same
rig as the 08-13 rip, so crop_card is carried over unchanged: threshold on
brightness plus saturation, blank the bottom of the frame where the stand and
the lit desk are, then bound by the dominant column and row profile. A plain
getbbox pulls in the desk.
"""
from PIL import Image, ImageDraw, ImageFont
import numpy as np
import json
import os

SRC = 'eBay_assets/card drop'
DATA = 'scripts/_bow3box_montage.json'
OUT = 'eBay_assets/bowchrome_3mega_box%d_2026-09-17.png'

W = 1600
MARGIN = 62
BG = (11, 18, 32)          # matches the data cards' #0b1220
INK = (232, 238, 248)
MUTED = (125, 147, 180)
ORANGE = (255, 154, 60)
RED = (255, 77, 94)
TEAL = (79, 214, 201)
BLUE = (90, 162, 255)

HERO_W, HERO_H = 400, 560
GRID_COLS, CARD_W, CARD_H, GAP = 7, 190, 264, 18

BOOK = {1: ('$111.29', '2.01x'), 2: ('$154.69', '2.80x'), 3: ('$202.96', '3.67x')}


def font(sz, bold=True):
    paths = ([r'C:\Windows\Fonts\arialbd.ttf'] if bold else []) + [r'C:\Windows\Fonts\arial.ttf']
    for p in paths:
        try:
            return ImageFont.truetype(p, sz)
        except Exception:
            pass
    return ImageFont.load_default()


def crop_card(num):
    im = Image.open(os.path.join(SRC, 'IMG_%d.JPEG' % num)).convert('RGB')
    hsv = np.asarray(im.convert('HSV')).astype(int)
    sat, val = hsv[:, :, 1], hsv[:, :, 2]
    mask = (val > 100) & ((sat > 40) | (val > 170))
    mask[int(mask.shape[0] * 0.86):, :] = False
    cols, rows = mask.sum(0), mask.sum(1)
    if not cols.max() or not rows.max():
        return im
    cs = np.where(cols > cols.max() * 0.30)[0]
    rs = np.where(rows > rows.max() * 0.30)[0]
    pad = 8
    return im.crop((max(0, cs.min() - pad), max(0, rs.min() - pad),
                    min(im.size[0], cs.max() + pad), min(im.size[1], rs.max() + pad)))


def fit(im, bw, bh):
    im = im.copy()
    im.thumbnail((bw, bh), Image.LANCZOS)
    return im


def place(canvas, im, x, y, frame=None, width=4):
    sh = Image.new('RGBA', (im.size[0] + 12, im.size[1] + 12), (0, 0, 0, 140))
    canvas.paste(sh, (x - 6, y - 2), sh)
    canvas.paste(im, (x, y))
    if frame:
        ImageDraw.Draw(canvas).rectangle(
            [x - 8, y - 8, x + im.size[0] + 7, y + im.size[1] + 7], outline=frame, width=width)


def tag(c):
    """One short line for a hero card. The picture says the rest."""
    bits = []
    p = c['parallel']
    if p and p.lower() != 'base':
        bits.append(p.replace(' Refractor', ''))
    else:
        bits.append('base #%s' % c['n'] if c['n'] and not str(c['n']).startswith('BCP') else 'base')
    # an unconfirmed digit ('?53/150' on the Skenes) has no business on a
    # graphic other people will read, so drop the serial rather than show a '?'
    if c['serial'] and '?' not in c['serial']:
        bits.append(c['serial'])
    if c['fb']:
        bits.append('1st Bowman')
    elif c['rc']:
        bits.append('RC')
    return '  \u00b7  '.join(bits)


def frame_for(c):
    p = (c['parallel'] or '').lower()
    if 'red rc' in p:
        return RED
    if c['serial'] or '/' in p:
        return ORANGE
    if 'mojo' in p or 'lazer' in p:
        return TEAL
    return None


def fan(cards, target_h):
    """Overlapping stack, slight alternating tilt, newest card on top."""
    ims = [fit(crop_card(c['front']), 10000, target_h) for c in cards]
    step = 74
    tilt = 4.0
    rot = []
    for k, im in enumerate(ims):
        a = tilt * (1 if k % 2 else -1) * (1 - k / (len(ims) * 1.6))
        r = im.convert('RGBA').rotate(a, Image.BICUBIC, expand=True)
        rot.append(r)
    w = step * (len(rot) - 1) + max(r.size[0] for r in rot)
    h = max(r.size[1] for r in rot)
    out = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    for k, r in enumerate(rot):
        sh = Image.new('RGBA', r.size, (0, 0, 0, 0))
        sh.paste((0, 0, 0, 120), (0, 0), r.split()[3])
        out.alpha_composite(sh, (k * step + 5, (h - r.size[1]) // 2 + 4))
        out.alpha_composite(r, (k * step, (h - r.size[1]) // 2))
    return out


def build(box, sel):
    show = sorted(sel['show'], key=lambda c: -(c['v'] or 0))
    # the chase cards have no comp at all, so value alone would bury them.
    # Anything numbered or a Red RC is promoted into the hero row by hand.
    special = [c for c in show if c['serial'] or 'red rc' in (c['parallel'] or '').lower()]
    heroes = special + [c for c in show if c not in special][:max(0, 3 - len(special))]
    heroes = heroes[:3]
    rest = [c for c in show if c not in heroes]
    fans = sel['fan']

    hero_ims = [fit(crop_card(c['front']), HERO_W, HERO_H) for c in heroes]
    hero_h = max(i.size[1] for i in hero_ims)
    grid_rows = -(-len(rest) // GRID_COLS)
    grid_h = grid_rows * CARD_H + (grid_rows - 1) * GAP
    fan_im = fan(fans, 300)
    fan_im = fit(fan_im, W - 2 * MARGIN - 250, 340)

    head_h = 86
    H = (MARGIN + head_h + hero_h + 54 + 46 + grid_h + 58
         + fan_im.size[1] + MARGIN)

    c = Image.new('RGB', (W, H), BG)
    d = ImageDraw.Draw(c)

    # header
    y = MARGIN
    d.text((MARGIN, y), 'BOX %d' % box, font=font(50), fill=INK)
    book, mult = BOOK[box]
    d.text((W - MARGIN, y + 4), book, font=font(46), fill=INK, anchor='ra')
    bw = d.textlength(book, font=font(46))
    d.text((W - MARGIN - bw - 18, y + 20), mult, font=font(26), fill=(61, 220, 151), anchor='ra')
    d.text((MARGIN, y + 58), '36 cards  \u00b7  6 packs  \u00b7  $55.34',
           font=font(21, False), fill=MUTED)

    # hero row
    y += head_h
    gapx = (W - 2 * MARGIN - sum(i.size[0] for i in hero_ims)) // max(1, len(hero_ims) - 1)
    x = MARGIN
    for im, card in zip(hero_ims, heroes):
        place(c, im, x, y + (hero_h - im.size[1]) // 2, frame_for(card), 5)
        ty = y + hero_h + 22
        d.text((x, ty), card['player'].upper(), font=font(25), fill=INK)
        d.text((x, ty + 30), tag(card), font=font(19, False), fill=MUTED)
        x += im.size[0] + gapx

    # grid of everything else
    y += hero_h + 54 + 46
    gx0 = (W - (GRID_COLS * CARD_W + (GRID_COLS - 1) * GAP)) // 2
    for k, card in enumerate(rest):
        im = fit(crop_card(card['front']), CARD_W, CARD_H)
        px = gx0 + (k % GRID_COLS) * (CARD_W + GAP) + (CARD_W - im.size[0]) // 2
        py = y + (k // GRID_COLS) * (CARD_H + GAP) + (CARD_H - im.size[1]) // 2
        place(c, im, px, py, frame_for(card), 3)

    # the fan, with the one label it needs
    y += grid_h + 58
    c.paste(fan_im, (MARGIN, y), fan_im)
    lx = MARGIN + fan_im.size[0] + 34
    ly = y + fan_im.size[1] // 2 - 52
    d.text((lx, ly), '+%d' % len(fans), font=font(64), fill=BLUE)
    d.text((lx, ly + 72), 'base veterans', font=font(26), fill=INK)
    d.text((lx, ly + 104), 'no rookie, no 1st Bowman', font=font(20, False), fill=MUTED)

    out = OUT % box
    c.save(out)
    print('saved %s  %dx%d  (%d hero, %d grid, %d fanned)'
          % (out, c.size[0], c.size[1], len(heroes), len(rest), len(fans)))


def main():
    sel = json.load(open(DATA))
    for b in (1, 2, 3):
        build(b, sel[str(b)])


if __name__ == '__main__':
    main()
