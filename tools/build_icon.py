"""Generate the launcher icon (512x423, the Samsung Home tile ratio) with only Python's standard library.

Design: a 2x2 grid of rounded app tiles, the first one lit, over a dusk gradient with a low sun.
Run from anywhere: python tools/build_icon.py
"""
from pathlib import Path
import struct
import zlib

WIDTH, HEIGHT, SAMPLES = 512, 423, 3
TILE, GAP, RADIUS = 108, 24, 30
SKY = ((24, 33, 64), (74, 70, 120), (214, 132, 94), (246, 188, 112))
STOPS = (0.0, 0.42, 0.78, 1.0)


def chunk(kind, data):
    return struct.pack('!I', len(data)) + kind + data + struct.pack('!I', zlib.crc32(kind + data) & 0xffffffff)


def mix(a, b, amount):
    return tuple(a[i] + (b[i] - a[i]) * amount for i in range(3))


def sky(y):
    t = y / HEIGHT
    for index in range(len(STOPS) - 1):
        if t <= STOPS[index + 1]:
            local = (t - STOPS[index]) / (STOPS[index + 1] - STOPS[index])
            return mix(SKY[index], SKY[index + 1], local)
    return SKY[-1]


def rounded_distance(x, y, left, top, size):
    """Signed distance to a rounded square; negative inside."""
    cx, cy = left + size / 2, top + size / 2
    qx, qy = abs(x - cx) - (size / 2 - RADIUS), abs(y - cy) - (size / 2 - RADIUS)
    outside = (max(qx, 0) ** 2 + max(qy, 0) ** 2) ** 0.5
    return outside + min(max(qx, qy), 0) - RADIUS


def tiles():
    total = TILE * 2 + GAP
    left, top = (WIDTH - total) / 2, (HEIGHT - total) / 2 - 8
    return [(left + col * (TILE + GAP), top + row * (TILE + GAP), row == 0 and col == 0)
            for row in range(2) for col in range(2)]


TILES = tiles()


def pixel(x, y):
    colour = sky(y)
    glow = max(0.0, 1 - (((x - WIDTH / 2) / 250) ** 2 + ((y - HEIGHT * 0.8) / 150) ** 2))
    colour = mix(colour, (255, 226, 160), glow * 0.55)
    for left, top, lit in TILES:
        distance = rounded_distance(x, y, left, top, TILE)
        if distance < 0:
            colour = mix(colour, (255, 255, 255), 0.96 if lit else 0.30)
        elif distance < 2.5:
            colour = mix(colour, (255, 255, 255), 0.45 * (1 - distance / 2.5))
    return colour


def render():
    rows = []
    for y in range(HEIGHT):
        row = bytearray([0])
        for x in range(WIDTH):
            red = green = blue = 0.0
            for sy in range(SAMPLES):
                for sx in range(SAMPLES):
                    r, g, b = pixel(x + (sx + 0.5) / SAMPLES, y + (sy + 0.5) / SAMPLES)
                    red, green, blue = red + r, green + g, blue + b
            count = SAMPLES * SAMPLES
            row.extend((round(red / count), round(green / count), round(blue / count)))
        rows.append(bytes(row))
    png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('!2I5B', WIDTH, HEIGHT, 8, 2, 0, 0, 0))
    return png + chunk(b'IDAT', zlib.compress(b''.join(rows), 9)) + chunk(b'IEND', b'')


if __name__ == '__main__':
    target = Path(__file__).resolve().parents[1] / 'launcher' / 'icon.png'
    target.write_bytes(render())
    print('Wrote', target, target.stat().st_size, 'bytes')
