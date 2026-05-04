// One-shot: render docs/references/screenshots/marketplace-cover.png at 1080x1080.
// Run: node scripts/generate-marketplace-cover.mjs [storefrontUrl]
// If no URL is passed, falls back to the constant below. Iterate by editing
// the SVG / styling and re-running.

import sharp from 'sharp';
import qrcode from 'qrcode';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '..', 'docs', 'references', 'screenshots');
const outPath = join(outDir, 'marketplace-cover.png');

const DEFAULT_URL = 'https://pokestonks.vercel.app/storefront/kc63YE_abrlmeboc';
const storefrontUrl = process.argv[2] || DEFAULT_URL;
// Visible URL text shown below the QR (drop https:// for legibility).
const displayUrl = storefrontUrl.replace(/^https?:\/\//, '');

// Generate QR as SVG path. Margin 0; we control padding via the surrounding rect.
const qrSvgRaw = await qrcode.toString(storefrontUrl, {
  type: 'svg',
  errorCorrectionLevel: 'M',
  margin: 0,
  color: { dark: '#0a0d1f', light: '#ffffff' },
});
// Extract the inner viewBox + content of the qr svg so we can re-embed inside
// our main canvas at our chosen size + position.
const qrInnerMatch = qrSvgRaw.match(/<svg[^>]*viewBox="([^"]+)"[^>]*>([\s\S]*?)<\/svg>/);
if (!qrInnerMatch) throw new Error('Could not parse qrcode SVG output');
const qrViewBox = qrInnerMatch[1];
const qrInner = qrInnerMatch[2];

// Layout constants (1080x1080 canvas).
const QR_SIZE = 360;
const QR_X = (1080 - QR_SIZE) / 2; // centered
const QR_Y = 470;

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0a0d1f"/>
      <stop offset="55%" stop-color="#161033"/>
      <stop offset="100%" stop-color="#0e0820"/>
    </linearGradient>
    <radialGradient id="foil" cx="78%" cy="20%" r="55%">
      <stop offset="0%" stop-color="#a78bff" stop-opacity="0.55"/>
      <stop offset="40%" stop-color="#5a4dff" stop-opacity="0.18"/>
      <stop offset="100%" stop-color="#000" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="rule" x1="0%" x2="100%" y1="0%" y2="0%">
      <stop offset="0%" stop-color="#f5d27c"/>
      <stop offset="100%" stop-color="#e0a14f" stop-opacity="0"/>
    </linearGradient>
  </defs>

  <!-- background -->
  <rect width="1080" height="1080" fill="url(#bg)"/>
  <rect width="1080" height="1080" fill="url(#foil)"/>

  <!-- diagonal accent lines -->
  <g opacity="0.08" stroke="#fff" stroke-width="1.5">
    <line x1="-50" y1="200" x2="1130" y2="-50"/>
    <line x1="-50" y1="320" x2="1130" y2="70"/>
    <line x1="-50" y1="440" x2="1130" y2="190"/>
  </g>

  <!-- corner sigil -->
  <g transform="translate(86 86)" fill="#f5d27c">
    <circle cx="0" cy="0" r="18" fill="none" stroke="#f5d27c" stroke-width="2"/>
    <circle cx="0" cy="0" r="4"/>
  </g>

  <!-- headline split to 2 lines so it always fits regardless of font fallback -->
  <g font-family="Arial Black, 'Segoe UI', Impact, system-ui, sans-serif" font-weight="900" letter-spacing="-1" text-anchor="middle">
    <text x="540" y="180" font-size="84" fill="#ffffff">SEALED POKÉMON</text>
    <text x="540" y="280" font-size="100" fill="#f5d27c">TCG</text>
  </g>

  <!-- gold rule centered -->
  <rect x="380" y="312" width="320" height="3" fill="url(#rule)"/>

  <!-- categories under headline -->
  <g font-family="'Segoe UI', Arial, system-ui, sans-serif" fill="#d8d4ff" text-anchor="middle">
    <text x="540" y="358" font-size="26" font-weight="600">Booster Boxes · ETBs · Bundles · Tins</text>
    <text x="540" y="392" font-size="26" font-weight="600">Premium Collections · Promos</text>
  </g>

  <!-- "Full live menu" header above QR -->
  <g font-family="'Segoe UI', Arial, system-ui, sans-serif" fill="#a78bff" text-anchor="middle">
    <text x="540" y="430" font-size="24" font-weight="700" letter-spacing="4">SCAN FOR FULL LIVE MENU</text>
  </g>

  <!-- QR code with white padding plate -->
  <rect x="${QR_X - 24}" y="${QR_Y - 24}" width="${QR_SIZE + 48}" height="${QR_SIZE + 48}" rx="16" fill="#ffffff"/>
  <svg x="${QR_X}" y="${QR_Y}" width="${QR_SIZE}" height="${QR_SIZE}" viewBox="${qrViewBox}" preserveAspectRatio="xMidYMid meet">
    ${qrInner}
  </svg>

  <!-- URL text under QR -->
  <g font-family="'Consolas', 'Courier New', monospace" fill="#d8d4ff" text-anchor="middle">
    <text x="540" y="${QR_Y + QR_SIZE + 70}" font-size="22" font-weight="500">${displayUrl}</text>
  </g>

  <!-- footer line -->
  <g font-family="'Segoe UI', Arial, system-ui, sans-serif" fill="#888aaa" text-anchor="middle">
    <text x="540" y="1010" font-size="20" font-weight="400">Local pickup + shipping · prices live, always current</text>
  </g>
</svg>`;

const buffer = Buffer.from(svg);
await sharp(buffer, { density: 300 }).png().toFile(outPath);
console.log('Wrote', outPath);
console.log('QR encodes:', storefrontUrl);
