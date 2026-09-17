"""
Card montages for the three-mega 2026 Bowman Chrome rip, one image per box.

  python scripts/build_bow3box_montage.py

The data cards carry the numbers. These carry the cards, which Michael asked for
after the first pass: "You didnt include the actual cards lie on the thread
though - people want to see the hits!"

v2, to his three notes on v1:

  "Crops are too aggresive on the cards"
      crop_card now pads the detected box and then locks it to the real 2.5x3.5
      card aspect by WIDENING only, never by growing downward, so a tight side
      can't shave a border off and the acrylic stand still can't creep in. v1
      used the 08-13 montage's crop unchanged, which was tuned for a layout
      where the cards sat much smaller.

  "I actually dont lke the fan lets just line them up on the bottom"
      the fanned base stack is gone. Base is the last strip, laid out in the
      same grid as every other strip.

  "lets seperate the 1st bowmans from rookie cards from inserts from base"
      five labelled strips: THE HITS, 1ST BOWMAN, ROOKIE CARDS, INSERTS, BASE.
      A card lands in exactly one, so the counts on the labels add to 36 and
      nothing is shown twice. Precedence is insert, then 1st Bowman, then
      rookie, then base: the insert bucket is its own thing per his list, and
      the 1ST BOWMAN logo outranks the RC badge because that is the one buyers
      search on.

THE HITS is picked by hand, not by price. The three numbered Mojos have no comp
at all six days before street date, so sorting on value would bury the best
cards in the box. Anything numbered or a Red RC is promoted; the rest of the
slots go to the dearest cards.

Cards are shot portrait on an acrylic stand against a dark backdrop. The card is
the bright mass in the frame, so: threshold on brightness plus saturation, blank
the bottom of the frame where the stand and the lit desk are, then bound by the
dominant column and row profile. A plain getbbox pulls in the desk.
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
RULE = (38, 52, 74)
GREEN = (61, 220, 151)
ORANGE = (255, 154, 60)
RED = (255, 77, 94)
TEAL = (79, 214, 201)

ASPECT = 2.5 / 3.5

HERO_COLS, HERO_W, HERO_GAP = 3, 400, 38
MAX_COLS, GAP = 8, 16
AVAIL = W - 2 * MARGIN
CARD_W = (AVAIL - (MAX_COLS - 1) * GAP) // MAX_COLS
CARD_H = int(CARD_W / ASPECT)

BOOK = {1: ('$111.29', '2.01x'), 2: ('$154.69', '2.80x'), 3: ('$202.96', '3.67x')}
STRIPS = [('parallel', 'Mojos & Lazers'), ('firstbow', '1st Bowman'),
          ('rookie', 'Rookie Cards'), ('insert', 'Inserts'), ('base', 'Base')]


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
    mask[int(mask.shape[0] * 0.88):, :] = False
    cols, rows = mask.sum(0), mask.sum(1)
    if not cols.max() or not rows.max():
        return im
    cs = np.where(cols > cols.max() * 0.30)[0]
    rows_i = np.where(rows > rows.max() * 0.30)[0]
    iw, ih = im.size
    x0, x1 = float(cs.min()), float(cs.max())
    y0, y1 = float(rows_i.min()), float(rows_i.max())
    # generous pad everywhere except the bottom, which is where the stand is
    x0 -= 0.030 * iw
    x1 += 0.030 * iw
    y0 -= 0.030 * ih
    y1 += 0.008 * ih
    # lock to the card aspect by widening only, so the bottom never grows into
    # the stand and no border gets shaved off a narrow side
    h = y1 - y0
    if (x1 - x0) / h < ASPECT:
        nw = h * ASPECT
        cx = (x0 + x1) / 2
        x0, x1 = cx - nw / 2, cx + nw / 2
    return im.crop((int(max(0, x0)), int(max(0, y0)),
                    int(min(iw, x1)), int(min(ih, y1))))


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
            [x - 7, y - 7, x + im.size[0] + 6, y + im.size[1] + 6], outline=frame, width=width)


def bucket(c):
    """One bucket per card, and a parallel is never anything else.

    v2 sorted on the card's identity first, so a Mojo or a Lazer with no 1st
    Bowman logo and no RC badge fell through to BASE. Michael: "why did you
    throw in mojo and lazer refractors w/ the base". A Mojo is not a base card,
    so parallels now take their own strip ahead of everything, which also stops
    the inconsistency where a 1st Bowman Mojo showed under 1ST BOWMAN while a
    veteran Mojo showed under BASE.
    """
    p = (c['parallel'] or '').lower()
    if p not in ('base', 'base insert', ''):
        return 'parallel'
    if 'insert' in c['kind']:
        return 'insert'
    if c['fb']:
        return 'firstbow'
    if c['rc']:
        return 'rookie'
    return 'base'


def tag(c):
    """One short line under a hit. The picture says the rest."""
    bits = []
    p = c['parallel']
    bits.append(p.replace(' Refractor', '') if p and p.lower() != 'base' else 'base')
    # an unconfirmed digit ('?53/150' on the Skenes) has no business on a
    # graphic other people will read, so drop the serial rather than show a '?'
    if c['serial'] and '?' not in c['serial']:
        bits.append(c['serial'])
    bits.append('1st Bowman' if c['fb'] else 'RC' if c['rc'] else '#%s' % c['n'])
    return '  \u00b7  '.join(b for b in bits if b and b != '#None')


def frame_for(c):
    p = (c['parallel'] or '').lower()
    if 'red rc' in p:
        return RED
    if c['serial'] or '/' in p:
        return ORANGE
    if 'mojo' in p or 'lazer' in p:
        return TEAL
    return None


def strip_grid(n):
    """Rows and columns for one strip.

    Full rows run the whole content width and a short last row is centred under
    them. Two other rules were tried and both looked worse: a fixed column
    count with the remainder left-aligned put a third of the image in dead
    space, and spreading the cards evenly across the minimum number of rows
    (10 as 5 and 5) shrank every strip away from the margins. Card size is
    constant across strips on purpose; sizing per strip made the 8 rookies
    smaller than the 10 1st Bowmans, and the rookies are the dearer cards.
    """
    if not n:
        return 0, 0
    return -(-n // MAX_COLS), MAX_COLS


def build(box, sel):
    all_cards = sel['show'] + sel['fan']
    ranked = sorted(all_cards, key=lambda c: -(c['v'] or 0))
    special = [c for c in ranked
               if c['serial'] or 'red rc' in (c['parallel'] or '').lower()]
    hits = (special + [c for c in ranked if c not in special])[:HERO_COLS]
    groups = {k: [] for k, _ in STRIPS}
    for c in all_cards:
        if c in hits:
            continue
        groups[bucket(c)].append(c)
    # strips are homogeneous now, so order them on value and let the cards with
    # no comp (the numbered mega parallels) lead rather than sink to the end
    for k in groups:
        groups[k].sort(key=lambda c: (0 if c['serial'] else 1, -(c['v'] or 0)))

    hero_ims = [fit(crop_card(c['front']), HERO_W, 10000) for c in hits]
    hero_h = max(i.size[1] for i in hero_ims)

    LBL, TAGH, SGAP = 42, 60, 30
    H = MARGIN + 96 + LBL + hero_h + TAGH
    for k, _ in STRIPS:
        rws, _ = strip_grid(len(groups[k]))
        if rws:
            H += SGAP + LBL + rws * CARD_H + (rws - 1) * GAP
    H += MARGIN

    c = Image.new('RGB', (W, H), BG)
    d = ImageDraw.Draw(c)

    # header
    y = MARGIN
    d.text((MARGIN, y), 'BOX %d' % box, font=font(52), fill=INK)
    book, mult = BOOK[box]
    d.text((W - MARGIN, y + 4), book, font=font(48), fill=INK, anchor='ra')
    d.text((W - MARGIN - d.textlength(book, font=font(48)) - 18, y + 22),
           mult, font=font(27), fill=GREEN, anchor='ra')
    d.text((MARGIN, y + 62), '36 cards  \u00b7  6 packs  \u00b7  $55.34',
           font=font(22, False), fill=MUTED)

    def label(text, count, yy):
        d.text((MARGIN, yy), text.upper(), font=font(23), fill=INK)
        wid = d.textlength(text.upper(), font=font(23))
        d.text((MARGIN + wid + 14, yy + 3), str(count), font=font(21), fill=MUTED)
        d.line([MARGIN, yy + 34, W - MARGIN, yy + 34], fill=RULE, width=2)

    # the hits
    y += 96
    label('The hits', len(hits), y)
    y += LBL
    x = MARGIN
    for im, card in zip(hero_ims, hits):
        place(c, im, x, y + (hero_h - im.size[1]) // 2, frame_for(card), 5)
        d.text((x, y + hero_h + 20), card['player'].upper(), font=font(26), fill=INK)
        d.text((x, y + hero_h + 51), tag(card), font=font(19, False), fill=MUTED)
        x += HERO_W + HERO_GAP
    y += hero_h + TAGH

    # the four buckets
    for key, name in STRIPS:
        g = groups[key]
        if not g:
            continue
        y += SGAP
        label(name, len(g), y)
        y += LBL
        rws, cols = strip_grid(len(g))
        for k, card in enumerate(g):
            r, col = k // cols, k % cols
            in_row = min(cols, len(g) - r * cols)
            row_w = in_row * CARD_W + (in_row - 1) * GAP
            x0 = MARGIN + (AVAIL - row_w) // 2
            im = fit(crop_card(card['front']), CARD_W, CARD_H)
            px = x0 + col * (CARD_W + GAP) + (CARD_W - im.size[0]) // 2
            py = y + r * (CARD_H + GAP) + (CARD_H - im.size[1]) // 2
            place(c, im, px, py, frame_for(card), 3)
        y += rws * CARD_H + (rws - 1) * GAP

    out = OUT % box
    c.save(out)
    print('saved %s  %dx%d  hits %d  %s'
          % (out, c.size[0], c.size[1], len(hits),
             '  '.join('%s %d' % (n, len(groups[k])) for k, n in STRIPS)))


def main():
    sel = json.load(open(DATA))
    for b in (1, 2, 3):
        build(b, sel[str(b)])


if __name__ == '__main__':
    main()
