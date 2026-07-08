import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const svg = await readFile(new URL('../public/icon.svg', import.meta.url));
const out = (f) => fileURLToPath(new URL(`../public/${f}`, import.meta.url));

await sharp(svg).resize(192, 192).png().toFile(out('icon-192.png'));
await sharp(svg).resize(512, 512).png().toFile(out('icon-512.png'));
// Maskable: 512 canvas, dark-paper background. The maskable safe zone is a centered
// circle of DIAMETER 80% of the canvas (radius 0.4 * 512 = 204.8px). Our icon content
// is a square (icon.svg's rounded-rect fills its whole viewBox), and a square's
// corners sit at half-diagonal = side * sqrt(2)/2 from center. Solving
// side * sqrt(2)/2 <= 204.8 gives side <= ~289.6 (~56.6% of canvas width) as the exact
// fit; 410 (80% width, the old value) clipped corners badly. 280 (~54.7%) leaves a
// comfortable margin inside the safe circle.
await sharp({ create: { width: 512, height: 512, channels: 4, background: '#070d18' } })
  .composite([{ input: await sharp(svg).resize(280, 280).png().toBuffer(), gravity: 'centre' }])
  .png().toFile(out('icon-maskable-512.png'));
await sharp(svg).resize(180, 180).flatten({ background: '#070d18' }).png().toFile(out('apple-touch-icon.png'));
console.log('icons written');
