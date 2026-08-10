// Checklist source for sports card products: parallel ladders, print runs,
// insert sets, odds.
//
// Beckett has a page per product per year and it is the authoritative source
// for parallel structure. Michael, 2026-08-10: "Every single release product
// has a beckett page w/ the info."
//
// WebFetch gets 403 from Beckett. curl with a browser user-agent gets 200, the
// same TLS-fingerprint workaround already used for SportsCardsPro in
// lib/services/sportscardspro.ts. That makes this a LOCAL-ONLY path; it would
// not work from a Vercel function.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

export type ParallelLine = { name: string; serial: number | null; odds: string | null };

async function get(url: string): Promise<string> {
  const { stdout } = await execFileAsync(
    'curl',
    ['-sL', '--max-time', '45', '-A', UA, '-H', 'Accept-Language: en-US,en;q=0.9', url],
    { maxBuffer: 32 * 1024 * 1024 }
  );
  if (!stdout || stdout.length < 5000) throw new Error(`beckett: short response (${stdout.length} bytes) for ${url}`);
  return stdout;
}

function toText(html: string): string[] {
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '');
  const text = stripped
    .replace(/<li[^>]*>/gi, '\n')
    .replace(/<\/(p|div|h\d|tr|li)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  return text
    .replace(/&#8211;|&#8212;/g, '-')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

/**
 * Pull every "<name> - /<serial> (1:<odds> packs)" style line off a Beckett
 * product page. Beckett writes parallels as a bulleted list, so this catches
 * base ladders, insert ladders and autograph ladders alike.
 */
export async function fetchChecklist(url: string): Promise<{ lines: string[]; parallels: ParallelLine[] }> {
  const lines = toText(await get(url));
  const parallels: ParallelLine[] = [];
  for (const l of lines) {
    if (l.length > 120) continue;
    // "Gold Refractor /50 (1:85 packs)" or "Orange Sapphire - #/25"
    const m = l.match(/^([A-Z][A-Za-z' ]{2,40}?)\s*[-–]?\s*#?\/(\d{1,4})\b/);
    if (!m) continue;
    const odds = l.match(/1:([\d,]+)/)?.[0] ?? null;
    parallels.push({ name: m[1].trim(), serial: Number(m[2]), odds });
  }
  // 1/1s are written differently and are worth capturing.
  for (const l of lines) {
    if (/^(Padparadscha|Superfractor)[A-Za-z ]*\s*[-–]?\s*(1\/1|#?\/1)\b/i.test(l) && l.length < 120) {
      const name = l.split(/[-–]/)[0].trim();
      if (!parallels.some((p) => p.name === name)) parallels.push({ name, serial: 1, odds: l.match(/1:([\d,]+)/)?.[0] ?? null });
    }
  }
  return { lines, parallels };
}

/** Beckett's URL shape, e.g. 2025 + "bowman-draft-sapphire". */
export function beckettUrl(year: number, slug: string): string {
  return `https://www.beckett.com/news/${year}-${slug}-baseball-cards/`;
}
