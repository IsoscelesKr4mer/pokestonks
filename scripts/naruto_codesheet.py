"""
Build contact sheets of just the card-code strip from each Naruto photo.

Kayou prints the full card number (NREA02-UR-014L3) in small type at the
BOTTOM-LEFT of the card front. Reading 168 fronts one image at a time is
wasteful; cropping that strip and tiling many together lets one look settle a
dozen cards.

  python scripts/naruto_codesheet.py <first> <last> [--step N] [--out DIR]

Crops are generous because the card does not sit in exactly the same place in
every frame. If a code lands outside the strip the tile shows blank, which is a
visible failure rather than a silent wrong read -- fall back to reading that
photo whole.
"""
import sys, os, glob, re
from PIL import Image, ImageDraw

SRC = os.path.join(os.path.dirname(__file__), '..', 'eBay_assets', 'card drop')
OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'sheets')

# fraction of the frame holding the bottom-left code strip
X0 = float(os.environ.get('CS_X0', 0.06))
X1 = float(os.environ.get('CS_X1', 0.50))
Y0 = float(os.environ.get('CS_Y0', 0.70))
Y1 = float(os.environ.get('CS_Y1', 0.88))
SCALE = float(os.environ.get('CS_SCALE', 2))
PER_SHEET = int(os.environ.get('CS_PER', 8))


def strip(path):
    """Frame-relative crop, deliberately.

    Card-relative cropping was tried and abandoned: the acrylic stand is bright
    and wide enough at its base that every threshold that kept it out of the
    bounding box also ate part of the card. Frame-relative reads ~95% of these
    photos correctly, and the ones it misses come back visibly blank rather
    than wrong, so they can be read individually. A heuristic that fails
    loudly beats a cleverer one that fails quietly.
    """
    im = Image.open(path)
    w, h = im.size
    box = (int(w * X0), int(h * Y0), int(w * X1), int(h * Y1))
    c = im.crop(box)
    return c.resize((int(c.width * SCALE), int(c.height * SCALE)), Image.LANCZOS)


def main():
    first, last = int(sys.argv[1]), int(sys.argv[2])
    step = 1
    outdir = OUT
    if '--step' in sys.argv:
        step = int(sys.argv[sys.argv.index('--step') + 1])
    if '--out' in sys.argv:
        outdir = sys.argv[sys.argv.index('--out') + 1]
    os.makedirs(outdir, exist_ok=True)

    names = []
    for n in range(first, last + 1, step):
        p = os.path.join(SRC, f'IMG_{n}.JPEG')
        if os.path.exists(p):
            names.append((n, p))

    sheets = 0
    for i in range(0, len(names), PER_SHEET):
        chunk = names[i:i + PER_SHEET]
        tiles = [(n, strip(p)) for n, p in chunk]
        w = max(t.width for _, t in tiles) + 130
        h = sum(t.height for _, t in tiles)
        sheet = Image.new('RGB', (w, h), 'white')
        d = ImageDraw.Draw(sheet)
        y = 0
        for n, t in tiles:
            sheet.paste(t, (130, y))
            d.text((8, y + t.height // 2 - 6), f'{n}', fill='black')
            d.line([(0, y), (w, y)], fill='#bbbbbb')
            y += t.height
        out = os.path.join(outdir, f'codes_{chunk[0][0]}_{chunk[-1][0]}.jpg')
        sheet.save(out, quality=92)
        sheets += 1
        print(out, sheet.size)
    print(f'{len(names)} photos -> {sheets} sheets')


if __name__ == '__main__':
    main()
