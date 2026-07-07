import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const svg = await readFile(new URL('../public/icon.svg', import.meta.url));
const out = (f) => fileURLToPath(new URL(`../public/${f}`, import.meta.url));

await sharp(svg).resize(192, 192).png().toFile(out('icon-192.png'));
await sharp(svg).resize(512, 512).png().toFile(out('icon-512.png'));
// Maskable: 512 canvas, icon scaled to ~80% safe zone, dark-paper background.
await sharp({ create: { width: 512, height: 512, channels: 4, background: '#070d18' } })
  .composite([{ input: await sharp(svg).resize(410, 410).png().toBuffer(), gravity: 'centre' }])
  .png().toFile(out('icon-maskable-512.png'));
await sharp(svg).resize(180, 180).flatten({ background: '#070d18' }).png().toFile(out('apple-touch-icon.png'));
console.log('icons written');
