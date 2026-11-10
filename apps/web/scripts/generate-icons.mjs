// Regenerates the PWA / home-screen icons from the Nexo mark (same paths as
// components/nexo-logo.tsx, dark-brand version: white + teal on navy).
// Run from apps/web:  node scripts/generate-icons.mjs
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const NAVY = '#0B1F5B';
const TEAL = '#23C7B8';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// The mark's drawn area is ~45.5 units square, centred on (30, 36) of its 60×64 viewBox.
const MARK = 45.5;
const CX = 30;
const CY = 36;

/** size px, `fill` = fraction of the canvas the mark occupies, `radius` = corner radius fraction (0 = full bleed). */
function svg(size, fill, radius) {
  const s = (size * fill) / MARK;
  const r = size * radius;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${r}" fill="${NAVY}"/>
  <g transform="translate(${size / 2} ${size / 2}) scale(${s}) translate(${-CX} ${-CY})" fill="none" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M10 56 L10 16 L34 42" stroke="#FFFFFF"/>
    <path d="M26 42 L50 16 L50 56" stroke="${TEAL}"/>
    <g fill="#FFFFFF" stroke="none">
      <rect x="24.25" y="43.75" width="4.5" height="4.5" rx="1.2"/>
      <rect x="31.25" y="43.75" width="4.5" height="4.5" rx="1.2"/>
      <rect x="24.25" y="50.75" width="4.5" height="4.5" rx="1.2"/>
      <rect x="31.25" y="50.75" width="4.5" height="4.5" rx="1.2"/>
    </g>
  </g>
</svg>`;
}

// Full-bleed icons are flattened: iOS paints any alpha channel black.
const png = (size, fill, radius) => {
  const img = sharp(Buffer.from(svg(size, fill, radius)));
  return (radius === 0 ? img.flatten({ background: NAVY }) : img).png().toBuffer();
};

/** Minimal .ico container holding PNG images (supported by every current browser). */
function ico(images) {
  const header = Buffer.alloc(6 + 16 * images.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(({ size, data }, i) => {
    const e = 6 + 16 * i;
    header.writeUInt8(size, e);
    header.writeUInt8(size, e + 1);
    header.writeUInt16LE(1, e + 4);
    header.writeUInt16LE(32, e + 6);
    header.writeUInt32LE(data.length, e + 8);
    header.writeUInt32LE(offset, e + 12);
    offset += data.length;
  });
  return Buffer.concat([header, ...images.map((i) => i.data)]);
}

await mkdir(join(root, 'public/icons'), { recursive: true });
const out = {
  // "any": rounded navy tile, used by launchers that do not mask.
  'public/icons/icon-192.png': await png(192, 0.56, 0.22),
  'public/icons/icon-512.png': await png(512, 0.56, 0.22),
  // Maskable: full bleed, mark well inside the 80% safe circle (its diagonal is ~62%).
  'public/icons/icon-maskable-512.png': await png(512, 0.44, 0),
  // iOS rounds the corners itself and paints transparency black, so full bleed.
  'public/apple-touch-icon.png': await png(180, 0.56, 0),
  'public/favicon.ico': ico([
    { size: 32, data: await png(32, 0.66, 0.22) },
    { size: 48, data: await png(48, 0.66, 0.22) },
  ]),
};
for (const [file, data] of Object.entries(out)) {
  await writeFile(join(root, file), data);
  console.log(file, data.length);
}
