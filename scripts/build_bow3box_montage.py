"""
Card montages for the three-mega 2026 Bowman Chrome rip, one image per box.

  python scripts/build_bow3box_montage.py

The data cards carry the numbers. These carry the cards.

v3, to Michael's note on v2: "The graphics look super imbalanced now. Make them
look better. IDK about the 3 cards on top none of them are certified baners and
idk if they all warrant a spot on top".

Two changes.

THE TOP IS EARNED, NOT A FIXED THREE. v1 and v2 always promoted three cards,
which worked for box 3 (a $80 Red RC) and looked silly for box 1, where the
third-best card was a $6.50 Mojo sitting at the same size as the chase. Only a
serial-numbered parallel or the Red RC gets the top now, so box 1 and box 2 lead
with one card and box 3 with two. A promoted card is shown large beside a text
block with its odds and what it is worth, which is worth more than three
mid cards in a row.

BALANCED ROWS. v2 filled each row to the column cap and centred whatever was
left, so a strip of 10 came out as 8 and 2. Rows are now near-equal by
construction (10 goes 5 and 5, 9 goes 5 and 4, never 8 and 2) and the card size
is derived from the widest row so the strip still reaches the margins. Card size
therefore varies a little between strips, which is the trade for never seeing a
lonely two-card row again.

Buckets, in order, one card per bucket:
  MOJOS & LAZERS   any parallel. A Mojo is not a base card, which v2 got wrong.
  1ST BOWMAN       base card with the 1ST BOWMAN logo
  ROOKIE CARDS     base card with the RC badge
  INSERTS          Spring Breakout, It Came To The League
  BASE             everything else

Cards are shot portrait on an acrylic stand against a dark backdrop. The card is
the bright mass in the frame, so: threshold on brightness plus saturation, blank
the bottom of the frame where the stand and the lit desk are, then bound by the
dominant column and row profile. A plain getbbox pulls in the desk. The box is
padded and then locked to the real 2.5x3.5 card shape by WIDENING only, since
growing it downward would pull the stand back in.
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
AVAIL = W - 2 * MARGIN
BG = (11, 18, 32)          # matches the data cards' #0b1220
INK = (232, 238, 248)
MUTED = (125, 147, 180)
DIM = (105, 126, 158)
RULE = (38, 52, 74)
GREEN = (61, 220, 151)
ORANGE = (255, 154, 60)
RED = (255, 77, 94)
TEAL = (79, 214, 201)

ASPECT = 2.5 / 3.5
MAX_COLS, GAP, MAX_CARD_W = 8, 16, 216

BOOK = {1: ('$111.29', '2.01x'), 2: ('$154.69', '2.80x'), 3: ('$202.96', '3.67x')}
STRIPS = [('parallel', 'Mojos & Lazers'), ('firstbow', '1st Bowman'),
          ('rookie', 'Rookie Cards'), ('insert', 'Inserts'), ('base', 'Base')]

# Pack odds off the Topps mega odds sheet, and where the comps landed. The three
# numbered Mojos are mega-exclusive and megas do not street until Sept 23, so
# two of them have no live market at all; say that rather than invent a number.
CHASE = {
    'Jaider Suarez':  ('1 in 115 packs', 'no comp yet', False),
    'Konnor Griffin': ('1 in 92 packs', 'about $36', True),
    'Paul Skenes':    ('1 in 153 packs', 'no comp yet', False),
    'Sal Stewart':    ('1 in 4 packs', '$80', True),
}


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
    rs = np.where(rows > rows.max() * 0.30)[0]
    # Take the WIDTH and the TOP edge from the profiles and derive the height
    # from the card's real 2.5x3.5 shape. The bottom edge cannot be measured:
    # the acrylic stand is bright, overlaps the bottom of the card and reads as
    # part of the same mass, which is why the row profile has to be blanked at
    # 0.88 in the first place. Measuring it anyway gave 58 of 108 crops an
    # aspect between 0.74 and 0.83 instead of 0.714, so cards came out squat by
    # differing amounts and no two grid cells matched. Deriving it puts every
    # crop on 0.714 to three decimals.
    x0, x1, y0 = float(cs.min()), float(cs.max()), float(rs.min())
    cw = x1 - x0
    px = 0.04 * cw
    py = px / ASPECT
    return im.crop((int(round(x0 - px)), int(round(y0 - py)),
                    int(round(x1 + px)), int(round(y0 + cw / ASPECT + py))))


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


def is_parallel(c):
    return (c['parallel'] or '').lower() not in ('base', 'base insert', '')


def bucket(c):
    """One bucket per card, and a parallel is never anything else.

    v2 sorted on the card's identity first, so a Mojo or Lazer with no 1st
    Bowman logo and no RC badge fell through to BASE. Michael: "why did you
    throw in mojo and lazer refractors w/ the base".
    """
    if is_parallel(c):
        return 'parallel'
    if 'insert' in c['kind']:
        return 'insert'
    if c['fb']:
        return 'firstbow'
    if c['rc']:
        return 'rookie'
    return 'base'


def earns_top(c):
    """Only a serial or the Red RC. Everything else goes in a strip."""
    return bool(c['serial']) or 'red rc' in (c['parallel'] or '').lower()


def frame_for(c):
    p = (c['parallel'] or '').lower()
    if 'red rc' in p:
        return RED
    if c['serial'] or '/' in p:
        return ORANGE
    if 'mojo' in p or 'lazer' in p:
        return TEAL
    return None


def rows_for(n):
    """Near-equal row sizes, so a strip never ends on a lonely card or two.

    v2 filled each row to the 8-column cap and centred the remainder, which
    turned a strip of 10 into a row of 8 and a row of 2. 10 now goes 5 and 5,
    9 goes 5 and 4, 13 goes 7 and 6.
    """
    if not n:
        return []
    r = -(-n // MAX_COLS)
    base, extra = divmod(n, r)
    return [base + 1] * extra + [base] * (r - extra)


def build(box, sel):
    all_cards = sel['show'] + sel['fan']
    top = sorted([c for c in all_cards if earns_top(c)],
                 key=lambda c: -(c['v'] or 0))
    groups = {k: [] for k, _ in STRIPS}
    for c in all_cards:
        if c not in top:
            groups[bucket(c)].append(c)
    for k in groups:
        groups[k].sort(key=lambda c: -(c['v'] or 0))

    # --- top block: the chase cards on the left with their odds, and what the
    # rest of the box held on the right, because one chase card and a text
    # block left the right half of the image empty
    ncol = len(top)
    col_w = (AVAIL - 44 * (ncol - 1)) // (ncol + (1 if ncol == 1 else 0))
    top_card_w = min(400, int(col_w * (0.44 if ncol > 1 else 0.52)))
    top_ims = [fit(crop_card(c['front']), top_card_w, 10000) for c in top]
    top_h = max(i.size[1] for i in top_ims)

    LBL, SGAP = 42, 32
    H = MARGIN + 96 + LBL + top_h
    for k, _ in STRIPS:
        rs = rows_for(len(groups[k]))
        if rs:
            cw = min(MAX_CARD_W, (AVAIL - (max(rs) - 1) * GAP) // max(rs))
            H += SGAP + LBL + len(rs) * int(cw / ASPECT) + (len(rs) - 1) * GAP
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

    y += 96
    label('The chase card' + ('s' if ncol > 1 else ''), ncol, y)
    y += LBL
    for k, (im, card) in enumerate(zip(top_ims, top)):
        x = MARGIN + k * (col_w + 44)
        place(c, im, x, y + (top_h - im.size[1]) // 2, frame_for(card), 5)
        tx = x + im.size[0] + 30
        ty = y + (top_h - 182) // 2
        d.text((tx, ty), card['player'].upper(), font=font(34), fill=INK)
        d.text((tx, ty + 44), card['parallel'], font=font(23), fill=INK)
        sub = card['serial'] if card['serial'] and '?' not in card['serial'] else \
            ('1st Bowman' if card['fb'] else 'RC' if card['rc'] else '#%s' % card['n'])
        d.text((tx, ty + 76), sub, font=font(21, False), fill=MUTED)
        odds, worth, priced = CHASE.get(card['player'], ('', '', False))
        if odds:
            d.text((tx, ty + 116), odds, font=font(21, False), fill=DIM)
            d.text((tx, ty + 148), worth, font=font(27),
                   fill=ORANGE if priced else DIM)

    # right-hand summary, only when a single chase card leaves the space free
    if ncol == 1:
        pars = [c for c in all_cards if is_parallel(c)]
        mojo = sum(1 for c in pars if 'mojo' in c['parallel'].lower()
                   and not c['serial'])
        lazer = sum(1 for c in pars if 'lazer' in c['parallel'].lower())
        numbered = sum(1 for c in pars if c['serial'])
        best = max((c for c in all_cards if c['v'] and c not in top),
                   key=lambda c: c['v'])
        rx = W - MARGIN
        ry = y + (top_h - 220) // 2
        d.text((rx, ry), 'THE REST OF THE BOX', font=font(19), fill=DIM, anchor='ra')
        lines = [
            '%d Mojo  ·  %d Lazer  ·  %d numbered' % (mojo, lazer, numbered),
            '%d 1st Bowman  ·  %d rookies  ·  %d inserts'
            % (sum(1 for c in all_cards if c['fb']),
               sum(1 for c in all_cards if c['rc']),
               sum(1 for c in all_cards if 'insert' in c['kind'])),
        ]
        for i, ln in enumerate(lines):
            d.text((rx, ry + 36 + i * 34), ln, font=font(24), fill=INK, anchor='ra')
        d.text((rx, ry + 126), 'BEST PRICED CARD', font=font(19), fill=DIM, anchor='ra')
        d.text((rx, ry + 158), '%s  %s' % (best['player'], best['parallel']
                                           if is_parallel(best) else 'base'),
               font=font(24), fill=INK, anchor='ra')
        d.text((rx, ry + 192), '$%.2f' % best['v'], font=font(27), fill=ORANGE, anchor='ra')
    y += top_h

    # --- the five strips
    for key, name in STRIPS:
        g = groups[key]
        if not g:
            continue
        y += SGAP
        label(name, len(g), y)
        y += LBL
        rs = rows_for(len(g))
        cw = min(MAX_CARD_W, (AVAIL - (max(rs) - 1) * GAP) // max(rs))
        ch = int(cw / ASPECT)
        i = 0
        for r, in_row in enumerate(rs):
            x0 = MARGIN + (AVAIL - (in_row * cw + (in_row - 1) * GAP)) // 2
            for col in range(in_row):
                im = crop_card(g[i]['front']).resize((cw, ch), Image.LANCZOS)
                place(c, im, x0 + col * (cw + GAP), y + r * (ch + GAP),
                      frame_for(g[i]), 3)
                i += 1
        y += len(rs) * ch + (len(rs) - 1) * GAP

    out = OUT % box
    c.save(out)
    print('saved %s  %dx%d  chase %d  %s'
          % (out, c.size[0], c.size[1], ncol,
             '  '.join('%s %d%s' % (n, len(groups[k]), rows_for(len(groups[k])))
                       for k, n in STRIPS)))


def main():
    sel = json.load(open(DATA))
    for b in (1, 2, 3):
        build(b, sel[str(b)])


if __name__ == '__main__':
    main()
