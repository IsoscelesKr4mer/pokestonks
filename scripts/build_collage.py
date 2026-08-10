import json, io, math, sys, requests
from PIL import Image, ImageDraw, ImageFont

# optional args: <title> <subtitle> <outpath>
TITLE  = sys.argv[1] if len(sys.argv) > 1 else "2026 TOPPS CHROME"
SUB    = sys.argv[2] if len(sys.argv) > 2 else None
OUT    = sys.argv[3] if len(sys.argv) > 3 else 'eBay_assets/toppschrome_box_hits_collage.png'

cards = json.load(open('scripts/collage-list.json', encoding='utf-8'))
imgs = []
for c in cards:
    try:
        r = requests.get(c['front'], timeout=30)
        if r.status_code == 200:
            imgs.append(Image.open(io.BytesIO(r.content)).convert('RGB'))
        else:
            print('skip', c['player'], r.status_code)
    except Exception as e:
        print('err', c['player'], str(e)[:80])

n = len(imgs)
cols = 6
rows = math.ceil(n / cols)
cw, ch = 340, 470          # cell
pad = 14
top = 132                  # header space
W = cols*cw + pad*(cols+1)
H = top + rows*ch + pad*(rows+1)
bg = (11, 11, 13)
canvas = Image.new('RGB', (W, H), bg)
draw = ImageDraw.Draw(canvas)

def font(sz, bold=True):
    for p in [r'C:\Windows\Fonts\seguisb.ttf', r'C:\Windows\Fonts\segoeui.ttf', r'C:\Windows\Fonts\arialbd.ttf', r'C:\Windows\Fonts\arial.ttf']:
        try: return ImageFont.truetype(p, sz)
        except: pass
    return ImageFont.load_default()

draw.text((pad+6, 34), TITLE, font=font(58), fill=(245,245,245))
draw.text((pad+8, 96), SUB if SUB else f"Box hits - {n} inserts, rookies & parallels", font=font(26), fill=(150,150,155))

for i, im in enumerate(imgs):
    rr, cc = divmod(i, cols)
    x = pad + cc*(cw+pad)
    y = top + pad + rr*(ch+pad)
    # fit image within cell keeping aspect
    iw, ih = im.size
    scale = min((cw)/iw, (ch)/ih)
    nw, nh = int(iw*scale), int(ih*scale)
    im2 = im.resize((nw, nh), Image.LANCZOS)
    canvas.paste(im2, (x + (cw-nw)//2, y + (ch-nh)//2))

out = OUT
canvas.save(out, quality=92)
print('saved', out, canvas.size, 'cards:', n)
