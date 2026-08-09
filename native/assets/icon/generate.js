/* App icon generator — edit bg.svg / fg.svg, then:
 *   npm install sharp    (one-off, not a project dependency — run inside
 *                          this directory, or delete node_modules after)
 *   node generate.js
 * Copy out/ic_launcher*-<density>.png into
 * android/app/src/main/res/mipmap-<density>/{ic_launcher,ic_launcher_round}.png
 * and out/ic_launcher_foreground-<density>.png into
 * mipmap-<density>/ic_launcher_foreground.png (adaptive icon layer).
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const bg = fs.readFileSync(path.join(__dirname, 'bg.svg'), 'utf8');
const fg = fs.readFileSync(path.join(__dirname, 'fg.svg'), 'utf8');

function innerOf(svgStr) {
  return svgStr.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
}

const bgInner = innerOf(bg);
const fgInner = innerOf(fg);

const combinedSquare = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108">${bgInner}${fgInner}</svg>`;

const combinedRound = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108">
  <defs><clipPath id="circleClip"><circle cx="54" cy="54" r="54"/></clipPath></defs>
  <g clip-path="url(#circleClip)">${bgInner}${fgInner}</g>
</svg>`;

const OUT = path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });

// legacy launcher icon sizes (dp -> px at each density)
const LEGACY = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
// adaptive icon layers are exported at the same density multiplier, but the
// canvas is 108dp (not 48dp) since the system crops a smaller visible area
const ADAPTIVE = { mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432 };

async function run() {
  for (const [density, size] of Object.entries(LEGACY)) {
    await sharp(Buffer.from(combinedSquare)).resize(size, size).png().toFile(path.join(OUT, `ic_launcher-${density}.png`));
    await sharp(Buffer.from(combinedRound)).resize(size, size).png().toFile(path.join(OUT, `ic_launcher_round-${density}.png`));
  }
  for (const [density, size] of Object.entries(ADAPTIVE)) {
    await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108">${fgInner}</svg>`))
      .resize(size, size).png().toFile(path.join(OUT, `ic_launcher_foreground-${density}.png`));
  }
  // preview renders
  await sharp(Buffer.from(combinedSquare)).resize(512, 512).png().toFile(path.join(OUT, 'preview-square.png'));
  await sharp(Buffer.from(combinedRound)).resize(512, 512).png().toFile(path.join(OUT, 'preview-round.png'));
  console.log('done');
}

run().catch((e) => { console.error(e); process.exit(1); });
