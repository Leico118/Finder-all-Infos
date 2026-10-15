# Icônes de Radar : cercles concentriques et balayage, or sur fond sombre.
import math, os
from PIL import Image, ImageDraw

BG = (10, 10, 12, 255); GOLD = (217, 196, 163, 255); DIM = (217, 196, 163, 70); RING = (70, 66, 74, 255)

def mark(size, scale=1.0, bg=True, rounded=True):
    S = size * 4
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    if bg:
        if rounded: d.rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * 0.22), fill=BG)
        else: d.rectangle([0, 0, S, S], fill=BG)
    c = S / 2; R = S * 0.34 * scale
    # balayage (secteur dégradé)
    sweep = Image.new('RGBA', (S, S), (0, 0, 0, 0)); sd = ImageDraw.Draw(sweep)
    for k in range(45):
        a0 = -50 - k * 1.5
        sd.pieslice([c - R, c - R, c + R, c + R], a0 - 1.6, a0, fill=(217, 196, 163, int(70 * (1 - k / 45) ** 1.6)))
    im = Image.alpha_composite(im, sweep); d = ImageDraw.Draw(im)
    for f, w, col in [(1.0, 0.022, RING), (0.68, 0.026, GOLD), (0.36, 0.022, RING)]:
        r = R * f
        d.ellipse([c - r, c - r, c + r, c + r], outline=col, width=int(S * w * scale))
    a = math.radians(-50)
    d.line([c, c, c + R * math.cos(a), c + R * math.sin(a)], fill=GOLD, width=int(S * 0.03 * scale))
    r = R * 0.12
    d.ellipse([c - r, c - r, c + r, c + r], fill=GOLD)
    bx, by, br = c + R * 0.55 * math.cos(math.radians(-115)), c + R * 0.55 * math.sin(math.radians(-115)), R * 0.07
    d.ellipse([bx - br, by - br, bx + br, by + br], fill=GOLD)
    return im.resize((size, size), Image.LANCZOS)

web = 'web/public/icons'
mark(192).save(f'{web}/icon-192.png'); mark(512).save(f'{web}/icon-512.png')
mark(512, 0.8, rounded=False).save(f'{web}/maskable-512.png')
res = 'android/app/src/main/res'
for name, px in [('mdpi', 48), ('hdpi', 72), ('xhdpi', 96), ('xxhdpi', 144), ('xxxhdpi', 192)]:
    os.makedirs(f'{res}/mipmap-{name}', exist_ok=True)
    mark(px).save(f'{res}/mipmap-{name}/ic_launcher.png')
    fg = px * 108 // 48
    mark(fg, 0.62, bg=False).save(f'{res}/mipmap-{name}/ic_launcher_foreground.png')
print('icônes générées')
