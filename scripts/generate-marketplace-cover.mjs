// One-shot: render docs/references/screenshots/marketplace-cover.png at 1080x1080.
// Run: node scripts/generate-marketplace-cover.mjs
// Iterate by editing the SVG below and re-running.

import sharp from 'sharp';
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '..', 'docs', 'references', 'screenshots');
const outPath = join(outDir, 'marketplace-cover.png');

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080">
  <defs>
    <!-- deep night-sky gradient -->
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0a0d1f"/>
      <stop offset="55%" stop-color="#161033"/>
      <stop offset="100%" stop-color="#0e0820"/>
    </linearGradient>
    <!-- holographic foil sweep, top-right -->
    <radialGradient id="foil" cx="78%" cy="20%" r="55%">
      <stop offset="0%" stop-color="#a78bff" stop-opacity="0.55"/>
      <stop offset="40%" stop-color="#5a4dff" stop-opacity="0.18"/>
      <stop offset="100%" stop-color="#000" stop-opacity="0"/>
    </radialGradient>
    <!-- accent gold for the rule -->
    <linearGradient id="rule" x1="0%" x2="100%" y1="0%" y2="0%">
      <stop offset="0%" stop-color="#f5d27c"/>
      <stop offset="100%" stop-color="#e0a14f" stop-opacity="0"/>
    </linearGradient>
  </defs>

  <!-- background -->
  <rect width="1080" height="1080" fill="url(#bg)"/>
  <rect width="1080" height="1080" fill="url(#foil)"/>

  <!-- diagonal accent lines (subtle, Pokemon-card-foil energy) -->
  <g opacity="0.08" stroke="#fff" stroke-width="1.5">
    <line x1="-50" y1="200" x2="1130" y2="-50"/>
    <line x1="-50" y1="320" x2="1130" y2="70"/>
    <line x1="-50" y1="440" x2="1130" y2="190"/>
  </g>

  <!-- corner mark (just a tiny glyph; reads as a sigil, no app brand) -->
  <g transform="translate(86 86)" fill="#f5d27c">
    <circle cx="0" cy="0" r="18" fill="none" stroke="#f5d27c" stroke-width="2"/>
    <circle cx="0" cy="0" r="4"/>
  </g>

  <!-- headline block -->
  <g font-family="Arial Black, 'Segoe UI', Impact, system-ui, sans-serif" fill="#ffffff">
    <text x="86" y="380" font-size="120" font-weight="900" letter-spacing="-2" textLength="700" lengthAdjust="spacingAndGlyphs">SEALED</text>
    <text x="86" y="500" font-size="120" font-weight="900" letter-spacing="-2" textLength="780" lengthAdjust="spacingAndGlyphs">POKÉMON</text>
    <text x="86" y="620" font-size="120" font-weight="900" letter-spacing="-2" fill="#f5d27c">TCG</text>
  </g>

  <!-- gold rule -->
  <rect x="86" y="660" width="320" height="3" fill="url(#rule)"/>

  <!-- categories -->
  <g font-family="'Segoe UI', Arial, system-ui, sans-serif" fill="#d8d4ff">
    <text x="86" y="730" font-size="34" font-weight="600">Booster Boxes · ETBs · Bundles</text>
    <text x="86" y="780" font-size="34" font-weight="600">Tins · Premium Collections</text>
  </g>

  <!-- CTA -->
  <g font-family="'Segoe UI', Arial, system-ui, sans-serif">
    <text x="86" y="950" font-size="26" font-weight="700" fill="#a78bff" letter-spacing="3">MESSAGE FOR FULL MENU</text>
    <text x="86" y="990" font-size="22" font-weight="400" fill="#888aaa">Local pickup + shipping available</text>
  </g>
</svg>`;

const buffer = Buffer.from(svg);
await sharp(buffer, { density: 300 }).png().toFile(outPath);
console.log('Wrote', outPath);
