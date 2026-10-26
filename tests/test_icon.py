from pathlib import Path
import struct
import unittest
import zlib

ROOT = Path(__file__).resolve().parents[1]


class IconTests(unittest.TestCase):
    def read_png(self):
        data = (ROOT / 'launcher' / 'icon.png').read_bytes()
        self.assertEqual(data[:8], b'\x89PNG\r\n\x1a\n')
        position, chunks = 8, {}
        while position < len(data):
            length, kind = struct.unpack('!I4s', data[position:position + 8])
            body = data[position + 8:position + 8 + length]
            crc = struct.unpack('!I', data[position + 8 + length:position + 12 + length])[0]
            self.assertEqual(crc, zlib.crc32(kind + body) & 0xffffffff, kind)
            chunks.setdefault(kind, b'')
            chunks[kind] += body
            position += 12 + length
        return chunks

    def test_icon_is_a_valid_samsung_home_tile_png(self):
        chunks = self.read_png()
        width, height, depth, colour = struct.unpack('!2I2B', chunks[b'IHDR'][:10])
        self.assertEqual((width, height), (512, 423))
        self.assertEqual((depth, colour), (8, 2))
        raw = zlib.decompress(chunks[b'IDAT'])
        self.assertEqual(len(raw), height * (1 + width * 3))
        self.assertLess(len(raw), 700_000)

    def test_icon_file_stays_small_and_is_generated_by_the_checked_in_tool(self):
        size = (ROOT / 'launcher' / 'icon.png').stat().st_size
        self.assertLess(size, 150_000)
        import importlib.util
        spec = importlib.util.spec_from_file_location('build_icon', ROOT / 'tools' / 'build_icon.py')
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        self.assertEqual((module.WIDTH, module.HEIGHT), (512, 423))
        # Spot-check the renderer without re-rendering the whole image: lit tile is brighter than glass.
        left, top, lit = module.TILES[0]
        _, _, glass = module.TILES[1]
        self.assertTrue(lit and not glass)
        lit_pixel = module.pixel(left + module.TILE / 2, top + module.TILE / 2)
        glass_left, glass_top, _ = module.TILES[1]
        glass_pixel = module.pixel(glass_left + module.TILE / 2, glass_top + module.TILE / 2)
        self.assertGreater(sum(lit_pixel), sum(glass_pixel) + 150)


if __name__ == '__main__':
    unittest.main()
