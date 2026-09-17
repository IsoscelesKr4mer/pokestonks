"""
Collage sheets for the 2026 Bowman Chrome hobby box, for posting alongside the
rip analysis card.

    python scripts/make-hits-collage.py

Writes four 1600x900 images:
    bowman_chrome_hits_2026-09-10.png          10 hits, with pack odds
    bowman_chrome_1stbowman_2026-09-10.png     the other 1st Bowman prospects
    bowman_chrome_rookies_2026-09-10.png       base rookie cards
    bowman_chrome_inserts_2026-09-10.png       inserts

The card is found by masking the blue backdrop rather than by a fixed crop,
because the card sits at a slightly different spot in every shot. Left and
right edges read cleanly against the backdrop; the bottom does not, because the
acrylic stand overlaps it. So the width is measured and the height is derived
from a real card's 2.5 x 3.5 ratio, anchored at the detected top edge.

Card membership comes from the DATABASE, so these stay true if a parallel or a
1st Bowman flag is corrected later. Photo file numbers come from the ingest
snapshot, which is the only place they are recorded.
"""
import json, os, re, math
import numpy as np
from PIL import Image, ImageOps, ImageDraw, ImageFont

DROP = 'eBay_assets/card drop'
CARD_AR = 2.5 / 3.5          # a baseball card is 2.5 x 3.5 inches

# Michael asked for prices off the public version. Flip to True to put them
# back; everything else about the layout is unchanged either way.
SHOW_PRICES = False

# Pack odds, straight off the Topps odds sheet for this product, hobby column.
ODDS = {
    'BCP-174': '1:365 packs',   # Prospects Orange Shimmer
    'CPA-WD': '1:76 packs',     # Prospect Auto, Purple Refractor
    'CPA-RM': '1:6 packs',      # Prospect Autographs
    'WBC-12': '1:384 packs',    # WBC Flag Variation, Orange Refractor
    '3': '1:4 packs',           # Chrome Rookie Red RC Variation
    '76': '1:4 packs',
    'BCP-210': '1:20 packs',    # Prospects Refractor
    'BCP-218': '1:37 packs',    # Prospects Purple Shimmer
    'BCP-160': '1:6 packs',     # Prospects X-Fractor
    '49': '1:64 packs',         # Base Blue Refractor
}


def path(n):
    for e in ('.JPG', '.JPEG', '.jpg', '.jpeg'):
        p = f'{DROP}/IMG_{n}{e}'
        if os.path.exists(p):
            return p
    raise SystemExit('missing IMG_%s' % n)


def load(n):
    im = ImageOps.exif_transpose(Image.open(path(n)))
    if im.width > im.height:
        im = im.rotate(-90, expand=True)
    return im


def card_crop(n, w, h):
    """Cut the card out of the backdrop and return it at exactly w x h."""
    im = load(n)
    small = im.resize((im.width // 8, im.height // 8))
    a = np.asarray(small).astype(int)
    r, g, b = a[:, :, 0], a[:, :, 1], a[:, :, 2]
    bg = (b > 150) & (b - r > 45) & (b - g > 18)
    sat = a.max(2) - a.min(2)
    stand = (sat < 28) & (a.mean(2) > 165)      # the clear acrylic stand
    fg = (~bg) & (~stand)

    cols, rows = fg.sum(0), fg.sum(1)
    xs = np.where(cols > cols.max() * 0.35)[0]
    ys = np.where(rows > rows.max() * 0.35)[0]
    x0, x1 = xs[0] * 8, (xs[-1] + 1) * 8
    y0 = ys[0] * 8

    inset = int(round((x1 - x0) * 0.012))       # shave the backdrop fringe
    x0, x1, y0 = x0 + inset, x1 - inset, y0 + inset
    width = x1 - x0
    height = int(round(width / CARD_AR))
    if y0 + height > im.height:                 # never read past the frame
        height = im.height - y0
        width = int(round(height * CARD_AR))
        x0 = x0 + ((x1 - x0) - width) // 2
    return im.crop((x0, y0, x0 + width, y0 + height)).resize((w, h), Image.LANCZOS)


def font(size, bold=False):
    for name in (('segoeuib.ttf', 'arialbd.ttf') if bold else ('segoeui.ttf', 'arial.ttf')):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


W, H = 1600, 900
PAD = 46
TOP = 118
FOOT = 70
GAP_X, GAP_Y = 22, 14


def sheet(out, title, accent, cards, foot_l, foot_r, lines=2):
    """cards: dicts of player, detail, odds, price, img. Always two rows."""
    n = len(cards)
    rows = 1 if n <= 6 else 2
    cols = math.ceil(n / rows)
    label = 44 if lines == 2 else 64

    # size the card so it fits BOTH the row height and the column width, and
    # let whichever binds win. That is what keeps a 13 wide sheet legible.
    avail_w = W - 2 * PAD
    avail_h = H - TOP - FOOT
    row_h = (avail_h - (rows - 1) * GAP_Y) // rows
    ch = min(row_h - label - 6, int(((avail_w - (cols - 1) * GAP_X) // cols) / CARD_AR))
    cw = int(round(ch * CARD_AR))

    canvas = Image.new('RGB', (W, H), '#0b1220')
    d = ImageDraw.Draw(canvas)
    for i in range(H):
        t = i / H
        d.line([(0, i), (W, i)],
               fill=(11 + int(10 * (1 - t)), 18 + int(16 * (1 - t)), 32 + int(30 * (1 - t))))

    grid_w = cols * cw + (cols - 1) * GAP_X
    x_off = (W - grid_w) // 2
    # centre the whole block vertically, otherwise a width-constrained sheet
    # like the 7-wide one leaves all its slack under the bottom row
    block_h = rows * (ch + label) + (rows - 1) * GAP_Y
    y_top = TOP + max(0, (avail_h - block_h) // 2)

    # One title line. The kicker and the right-hand caption were filler, and
    # lines like "every one of them" read as padding rather than information.
    tf = font(40, True)
    d.text((x_off, 48), title, font=tf, fill='#e8eef8')
    if accent:
        d.text((x_off + d.textlength(title + ' ', font=tf), 48), accent, font=tf, fill='#5aa2ff')

    name_f = font(17 if cols <= 6 else 15, True)
    det_f = font(15 if cols <= 6 else 13.5, not SHOW_PRICES)
    odd_f = font(15 if cols <= 6 else 13.5, True)

    for i, c in enumerate(cards):
        col, row = i % cols, i // cols
        # a short final row is centred rather than left hanging
        in_row = min(cols, n - row * cols)
        row_off = x_off + (grid_w - (in_row * cw + (in_row - 1) * GAP_X)) // 2
        x = row_off + col * (cw + GAP_X)
        y = y_top + row * (ch + label + GAP_Y)

        d.rounded_rectangle([x - 4, y - 4, x + cw + 4, y + ch + 4], radius=10,
                            fill='#141d2e', outline='#233047')
        canvas.paste(card_crop(c['img'], cw, ch), (x, y))

        hot = bool(re.search(r'/25(?!\d)', c['detail']))
        ty = y + ch + 9
        d.text((x, ty), c['player'], font=name_f, fill='#e8eef8')
        d.text((x, ty + 21), c['detail'], font=det_f, fill='#ff9a3c' if hot else '#8fa4c2')
        if c.get('odds'):
            d.text((x, ty + 42), c['odds'], font=odd_f, fill='#5aa2ff')
        if SHOW_PRICES and c.get('price'):
            pf = font(19, True)
            amt = '$%d' % c['price']
            d.text((x + cw - d.textlength(amt, font=pf), ty), amt, font=pf,
                   fill='#ff9a3c' if hot else '#e8eef8')

    ff = font(15)
    d.line([(x_off, H - 52), (x_off + grid_w, H - 52)], fill='#1d2942')
    d.text((x_off, H - 40), foot_l, font=ff, fill='#6f86a6')
    d.text((x_off + grid_w - d.textlength(foot_r, font=ff), H - 40), foot_r, font=ff, fill='#6f86a6')

    canvas.save(out, quality=95)
    print('saved %s  %d cards, %d cols, card %dx%d' % (out, n, cols, cw, ch))


# ---------------------------------------------------------------- card lists
# Murakami #76 came out of this box TWICE, once as the Chrome Rookie Red RC
# Variation and once as the plain base. Keying the photo lookup on card number
# plus player alone collided, the base silently overwrote the Red RC, and both
# the hits sheet and the rookies sheet ended up showing the same base card.
# Michael caught it. The parallel STRING cannot be part of the key because the
# snapshot predates the rename to "Chrome Rookie Red RC Variation", but
# base-vs-not-base is stable across that rename and separates the pair.
snap = {(c['card_number'], c['player'], c['parallel'] == 'base'): c for c in
        json.load(open('scripts/_bow_final_prices.json'))}
rookie = json.load(open('scripts/_bow_rookie.json'))
firstb = json.load(open('scripts/_bow_firstbowman.json'))
rows = json.load(open('scripts/_bow_rows.json'))


def par_short(p):
    p = re.sub(r'\s*\(\d+/\d+\)', '', p)
    p = p.replace(' Refractor', '').replace(', Autograph', ' AUTO')
    p = p.replace('base AUTO', '1st Bowman AUTO')
    p = p.replace('Chrome Rookie Red RC Variation', 'Red RC Variation')
    return p.strip()


def entry(r, detail, odds=None):
    s = snap[(r['card_number'], r['player'], r['parallel'] == 'base')]
    return {'player': r['player'], 'detail': detail, 'odds': odds,
            'price': (r['cents'] or 0) / 100, 'img': s['front']}


hits, inserts, firsts, rooks, vets, others = [], [], [], [], [], []
for r in sorted(rows, key=lambda x: -(x['cents'] or 0)):
    num, par, setn = r['card_number'], r['parallel'], r['set_name']
    ins = re.search(r'\(([^)]+?)\s*insert\)', setn)
    if par != 'base':
        hits.append(entry(r, par_short(par), ODDS.get(num)))
    elif ins:
        inserts.append(entry(r, ins.group(1)))
    elif firstb.get(num):
        firsts.append(entry(r, '1st Bowman  #' + num))
    elif re.fullmatch(r'\d+', num):
        (rooks if rookie.get(num) else vets).append(
            entry(r, ('Rookie Card  #' if rookie.get(num) else 'Base  #') + num))
    else:
        others.append(entry(r, 'Prospect  #' + num))

total = len(hits) + len(inserts) + len(firsts) + len(rooks) + len(vets) + len(others)
print('hits %d | 1st Bowman %d | base rookies %d | inserts %d | vets %d | other prospects %d  = %d'
      % (len(hits), len(firsts), len(rooks), len(inserts), len(vets), len(others), total))
assert total == 60, 'every card must land on exactly one sheet, got %d' % total
# and no two cards may share a photo, which is how the Murakami collision hid
all_imgs = [c['img'] for grp in (hits, inserts, firsts, rooks, vets, others) for c in grp]
assert len(set(all_imgs)) == 60, 'two cards share a photo: %d unique of %d' % (
    len(set(all_imgs)), len(all_imgs))

A = 'eBay_assets/bowman_chrome_%s_2026-09-10.png'
T = '2026 Bowman Chrome Hobby'
sheet(A % 'hits', T, 'Hits', hits,
      'Ripped Sept 10 2026, release day',
      'Two Orange /25s in one 12 pack box, about a 1 in 545 hit', lines=3)
sheet(A % '1stbowman', T, '1st Bowmans', firsts,
      'Every one carries the 1ST BOWMAN logo on the front',
      '7 of the 24 prospects in this box are not 1st Bowmans')
sheet(A % 'rookies', T, 'Base Rookies', rooks,
      'Rookie status taken from the official Topps checklist',
      'Murakami and Messick also came as Red RC Variations')
sheet(A % 'inserts', T, 'Inserts', inserts,
      'Ripped Sept 10 2026, release day',
      '5 different insert sets')
sheet(A % 'vets', T, 'Base Vets', vets,
      'Established big leaguers, no rookie logo',
      'Base cards run #1 to #100 in this set')
sheet(A % 'prospects', T, 'Prospects', others,
      'These players already had a Bowman card, so no 1ST BOWMAN logo',
      'Jesus Made is the consensus number 1 prospect in baseball')


# ------------------------------------------------------- the whole box, one sheet
def contact_sheet(out, sections):
    """
    All 60 on a single canvas, grouped by section.

    Not 1600x900: sixty cards with readable names does not fit a 16:9 frame, so
    this sizes its own canvas instead of shrinking the cards to fit one. Each
    section picks a column count that divides it evenly, which avoids a row of
    12 followed by a row of 1.
    """
    CWc, CHc = 170, 238
    GX, GY, LAB = 14, 16, 36
    HEAD, SECH, FOOTH = 186, 54, 78

    plan, max_cols = [], 0
    for title, note, cards in sections:
        nrows = max(1, math.ceil(len(cards) / 12))
        ncols = math.ceil(len(cards) / nrows)
        plan.append((title, note, cards, ncols, nrows))
        max_cols = max(max_cols, ncols)

    grid_w = max_cols * CWc + (max_cols - 1) * GX
    Wc = grid_w + 2 * 56
    body = sum(SECH + r * (CHc + LAB) + (r - 1) * GY for _, _, _, _, r in plan)
    Hc = HEAD + body + FOOTH

    canvas = Image.new('RGB', (Wc, Hc), '#0b1220')
    d = ImageDraw.Draw(canvas)
    for i in range(Hc):
        t = i / Hc
        d.line([(0, i), (Wc, i)],
               fill=(11 + int(9 * (1 - t)), 18 + int(14 * (1 - t)), 32 + int(26 * (1 - t))))

    x0 = (Wc - grid_w) // 2
    tf = font(46, True)
    d.text((x0, 62), '2026 Bowman Chrome Hobby', font=tf, fill='#e8eef8')
    d.text((x0 + d.textlength('2026 Bowman Chrome Hobby ', font=tf), 62), 'Box',
           font=tf, fill='#5aa2ff')

    def fit(text, f, width):
        if d.textlength(text, font=f) <= width:
            return text
        while text and d.textlength(text + '.', font=f) > width:
            text = text[:-1]
        return text + '.'

    nf, df = font(13, True), font(12)
    y = HEAD
    for title, note, cards, ncols, nrows in plan:
        # section label only; the right-hand caption was decorative
        d.text((x0, y - 34), title, font=font(16, True), fill='#5aa2ff')
        d.line([(x0, y - 12), (x0 + grid_w, y - 12)], fill='#1d2942')

        for i, c in enumerate(cards):
            col, row = i % ncols, i // ncols
            in_row = min(ncols, len(cards) - row * ncols)
            roff = x0 + (grid_w - (in_row * CWc + (in_row - 1) * GX)) // 2
            cx = roff + col * (CWc + GX)
            cy = y + row * (CHc + LAB + GY)
            d.rounded_rectangle([cx - 3, cy - 3, cx + CWc + 3, cy + CHc + 3], radius=8,
                                fill='#141d2e', outline='#233047')
            canvas.paste(card_crop(c['img'], CWc, CHc), (cx, cy))
            hot = bool(re.search(r'/25(?!\d)', c['detail']))
            d.text((cx, cy + CHc + 7), fit(c['player'], nf, CWc), font=nf, fill='#e8eef8')
            d.text((cx, cy + CHc + 22), fit(c['detail'], df, CWc), font=df,
                   fill='#ff9a3c' if hot else '#8fa4c2')
        y += SECH + nrows * (CHc + LAB) + (nrows - 1) * GY

    ff = font(16)
    d.line([(x0, Hc - 56), (x0 + grid_w, Hc - 56)], fill='#1d2942')
    d.text((x0, Hc - 42), 'Ripped Sept 10 2026, release day', font=ff, fill='#6f86a6')
    r2 = 'Two Orange /25s in one 12 pack box, about a 1 in 545 hit'
    d.text((x0 + grid_w - d.textlength(r2, font=ff), Hc - 42), r2, font=ff, fill='#6f86a6')

    canvas.save(out, quality=95)
    print('saved %s  %dx%d, %d cards' % (out, Wc, Hc, sum(len(c) for _, _, c in sections)))


contact_sheet(A % 'wholebox', [
    ('THE HITS', 'parallels, autos and variations', hits),
    ('1ST BOWMANS', 'carrying the 1ST BOWMAN logo', firsts),
    ('BASE ROOKIES', 'first Bowman Chrome base cards', rooks),
    ('INSERTS', '5 different insert sets', inserts),
    ('BASE VETS', 'established big leaguers', vets),
    ('OTHER PROSPECTS', 'prospects who are not 1st Bowmans', others),
])
