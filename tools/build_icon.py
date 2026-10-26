"""Generate an original simple launcher icon using only Python's standard library."""
from pathlib import Path
import struct
import zlib


def chunk(kind, data):
    return struct.pack('!I', len(data)) + kind + data + struct.pack('!I', zlib.crc32(kind + data) & 0xffffffff)


rows = []
for y in range(256):
    row = bytearray([0])
    for x in range(256):
        radius = ((x - 128)**2 + (y - 128)**2)**0.5
        ink = 64 < radius < 82 and not (x > 145 and 95 < y < 160)
        row.extend((225, 239, 250) if ink else (14 + x // 20, 25 + y // 15, 42 + x // 18))
    rows.append(bytes(row))
png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('!2I5B', 256, 256, 8, 2, 0, 0, 0))
png += chunk(b'IDAT', zlib.compress(b''.join(rows), 9)) + chunk(b'IEND', b'')
Path(__file__).resolve().parents[1].joinpath('launcher/icon.png').write_bytes(png)
