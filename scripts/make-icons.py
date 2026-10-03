#!/usr/bin/env python3
"""툴바·앱 아이콘 생성 (PLAN D-M8 M8-0 (g)). 표준 라이브러리만 사용, 결정적 출력.

사용: python3 scripts/make-icons.py  (저장소 어디서 실행해도 됨)
도형: 둥근 사각형, 왼쪽 회색(SDR)·오른쪽 어두운 회색->흰-노랑(EDR), 가운데 곡선 1개.
"""
import json
import os
import struct
import zlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EXT_DIR = os.path.join(ROOT, 'extension', 'popup', 'icons')
APP_DIR = os.path.join(ROOT, 'xcode', 'SDRHDR', 'SDRHDR', 'Assets.xcassets', 'AppIcon.appiconset')
ICON_PNG = os.path.join(ROOT, 'xcode', 'SDRHDR', 'SDRHDR', 'Resources', 'Icon.png')

RADIUS = 0.22
SDR_TOP, SDR_BOT = (0x8E, 0x8E, 0x93), (0x6B, 0x6B, 0x70)
EDR_DARK, EDR_LIGHT = (0x48, 0x48, 0x4C), (0xFF, 0xF6, 0xC8)
OFF_GRAY = (0x7A, 0x7A, 0x7F)
WHITE = (255, 255, 255)
P0, P1, P2 = (0.20, 0.78), (0.58, 0.80), (0.80, 0.22)  # 2차 베지어 (y는 아래로 증가)


def lerp(a, b, t):
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))


def stroke_width(size):
    if size <= 38:
        return 0.14
    if size <= 64:
        return 0.10
    return 0.075


def supersample(size):
    if size <= 256:
        return 4
    if size <= 512:
        return 3
    return 2


def curve_mask(n, width):
    """n x n 슈퍼샘플 격자에 굵은 곡선(둥근 끝)을 찍은 bytearray."""
    mask = bytearray(n * n)
    r = width * n / 2.0
    ri = int(r) + 1
    step = max(0.5, r / 4.0)
    length = n * 1.0
    count = int(length / step) + 1
    for i in range(count + 1):
        t = i / count
        x = (1 - t) ** 2 * P0[0] + 2 * (1 - t) * t * P1[0] + t * t * P2[0]
        y = (1 - t) ** 2 * P0[1] + 2 * (1 - t) * t * P1[1] + t * t * P2[1]
        cx, cy = x * n, y * n
        for yy in range(max(0, int(cy - ri)), min(n, int(cy + ri) + 1)):
            dy = yy + 0.5 - cy
            d2 = r * r - dy * dy
            if d2 < 0:
                continue
            dx = d2 ** 0.5
            a = max(0, int(cx - dx + 0.5))
            b = min(n, int(cx + dx + 0.5))
            if b > a:
                mask[yy * n + a:yy * n + b] = b'\x01' * (b - a)
    return mask


def render(size, off=False, inset=0.0):
    ss = supersample(size)
    n = size * ss
    mask = curve_mask(n, stroke_width(size))
    mid = n / 2.0
    mi = int(round(mid))
    rad = RADIUS * (1 - 2 * inset) * n
    lo = inset * n
    hi = n - lo
    curve_alpha = 0.55 if off else 1.0
    rows = []
    # 슈퍼샘플 행별 [a,b) (둥근 사각형 안쪽 구간)
    spans = []
    for yy in range(n):
        y = yy + 0.5
        if y < lo or y > hi:
            spans.append((0, 0))
            continue
        a, b = lo, hi
        if y < lo + rad:
            dy = lo + rad - y
            dx = (max(0.0, rad * rad - dy * dy)) ** 0.5
            a, b = lo + rad - dx, hi - rad + dx
        elif y > hi - rad:
            dy = y - (hi - rad)
            dx = (max(0.0, rad * rad - dy * dy)) ** 0.5
            a, b = lo + rad - dx, hi - rad + dx
        spans.append((int(round(a)), int(round(b))))
    for py in range(size):
        row = bytearray()
        v = (py + 0.5) / size
        for px in range(size):
            u = (px + 0.5) / size
            x0, x1 = px * ss, px * ss + ss
            nl = nr = cl = cr = 0
            for k in range(ss):
                yy = py * ss + k
                a, b = spans[yy]
                if b <= a:
                    continue
                ia, ib = max(a, x0), min(b, x1)
                if ib <= ia:
                    continue
                base = yy * n
                lcnt = max(0, min(ib, mi) - ia)
                rcnt = (ib - ia) - lcnt
                c_l = mask[base + ia:base + min(ib, mi)].count(1) if lcnt > 0 else 0
                c_r = mask[base + max(ia, mi):base + ib].count(1) if rcnt > 0 else 0
                nl += lcnt - c_l
                nr += rcnt - c_r
                cl += c_l
                cr += c_r
            tot = nl + nr + cl + cr
            if tot == 0:
                row += b'\x00\x00\x00\x00'
                continue
            if off:
                sdr = edr = OFF_GRAY
            else:
                sdr = lerp(SDR_TOP, SDR_BOT, v)
                t = min(1.0, max(0.0, 0.7 * (1 - v) + 0.3 * max(0.0, (u - 0.5) * 2)))
                edr = lerp(EDR_DARK, EDR_LIGHT, t)
            csdr = lerp(sdr, WHITE, curve_alpha)
            cedr = lerp(edr, WHITE, curve_alpha)
            col = [(nl * sdr[i] + nr * edr[i] + cl * csdr[i] + cr * cedr[i]) / tot for i in range(3)]
            alpha = tot / float(ss * ss)
            row += bytes([int(round(c)) for c in col]) + bytes([int(round(alpha * 255))])
        rows.append(bytes(row))
    return rows


def png_bytes(size, rows):
    raw = b''.join(b'\x00' + r for r in rows)

    def chunk(tag, data):
        c = struct.pack('>I', len(data)) + tag + data
        return c + struct.pack('>I', zlib.crc32(tag + data) & 0xFFFFFFFF)

    return (
        b'\x89PNG\r\n\x1a\n'
        + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0))
        + chunk(b'IDAT', zlib.compress(raw, 9))
        + chunk(b'IEND', b'')
    )


_cache = {}


def png(size, off=False, inset=0.0):
    key = (size, off, inset)
    if key not in _cache:
        _cache[key] = png_bytes(size, render(size, off, inset))
    return _cache[key]


def write(path, data):
    with open(path, 'wb') as f:
        f.write(data)


def main():
    os.makedirs(EXT_DIR, exist_ok=True)
    for s in (16, 19, 32, 38, 48, 64, 96, 128, 256, 512):
        write(os.path.join(EXT_DIR, 'icon-%d.png' % s), png(s))
    for s in (16, 19, 32, 38):
        write(os.path.join(EXT_DIR, 'icon-off-%d.png' % s), png(s, off=True))

    app_inset = 0.098  # macOS 앱 아이콘 여백(824/1024 규격)
    cpath = os.path.join(APP_DIR, 'Contents.json')
    with open(cpath, encoding='utf-8') as f:
        contents = json.load(f)
    for img in contents['images']:
        base = int(img['size'].split('x')[0])
        scale = int(img['scale'].rstrip('x'))
        name = 'icon_%dx%d%s.png' % (base, base, '' if scale == 1 else '@%dx' % scale)
        write(os.path.join(APP_DIR, name), png(base * scale, inset=app_inset))
        img['filename'] = name
    with open(cpath, 'w', encoding='utf-8') as f:
        json.dump(contents, f, indent=2, separators=(',', ' : '), ensure_ascii=False)
        f.write('\n')
    write(ICON_PNG, png(256))


if __name__ == '__main__':
    main()
