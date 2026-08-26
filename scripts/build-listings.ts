import { config } from 'dotenv';
import postgres from 'postgres';
import { writeFileSync } from 'fs';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });

const ESE = '272052757012';   // eBay Standard Envelope (<= $20)
const GA = '269110723012';    // Ground Advantage Calculated (> $20)
const PAYMENT = '269110704012', RETURN = '269110705012', LOC = 'edmonds-wa';

const TEAMS: Record<string, string> = {
  giants: 'San Francisco Giants', pirates: 'Pittsburgh Pirates', angels: 'Los Angeles Angels',
  mariners: 'Seattle Mariners', 'red sox': 'Boston Red Sox', 'white sox': 'Chicago White Sox',
  'blue jays': 'Toronto Blue Jays', nationals: 'Washington Nationals', braves: 'Atlanta Braves',
  reds: 'Cincinnati Reds', cardinals: 'St. Louis Cardinals', athletics: 'Athletics',
  brewers: 'Milwaukee Brewers', tigers: 'Detroit Tigers', astros: 'Houston Astros',
  guardians: 'Cleveland Guardians', dbacks: 'Arizona Diamondbacks', marlins: 'Miami Marlins',
  rockies: 'Colorado Rockies', phillies: 'Philadelphia Phillies', dodgers: 'Los Angeles Dodgers',
  mets: 'New York Mets', yankees: 'New York Yankees', royals: 'Kansas City Royals',
  padres: 'San Diego Padres', rangers: 'Texas Rangers', twins: 'Minnesota Twins',
  orioles: 'Baltimore Orioles', rays: 'Tampa Bay Rays',
};
function team(notes: string | null): string | null {
  const n = (notes || '').toLowerCase();
  for (const k of Object.keys(TEAMS)) if (n.includes(k)) return TEAMS[k];
  return null;
}
function stripParens(s: string) { return s.replace(/\s*\([^)]*\)/g, '').trim(); }
function insertName(set: string): string | null {
  const m = set.match(/\(([^)]*insert)\)/i);
  if (m) return m[1].replace(/\s*insert$/i, '').trim();
  return null;
}
function cleanParallel(p: string | null): string | null {
  if (!p) return null;
  let x = p.replace(/\s*\([^)]*\)/g, '').trim();       // drop "(mega box)", "(049/150)", "(PSA 10)" etc
  x = x.replace(/^base\s+/i, '').trim();               // "base Refractor" -> "Refractor"
  if (!x || /^(base|insert)$/i.test(x)) return null;   // plain base/insert carry no parallel name
  return x;
}
function capTitle(parts: string[], num: string | null): string {
  // assemble, then trim trailing optional parts to fit 80 (keep #num last)
  const numStr = num ? `#${num}` : '';
  let t = [...parts, numStr].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  while (t.length > 80 && parts.length > 3) { parts.pop(); t = [...parts, numStr].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim(); }
  return t.slice(0, 80).trim();
}

async function main() {
  const rows = await sql`SELECT id,player,set_name,year,card_number,parallel,asking_price_cents,notes,photo_urls
    FROM baseball_cards WHERE for_sale=true AND duplicate_of_id IS NULL AND status='priced' AND asking_price_cents IS NOT NULL
    AND coalesce(notes,'') NOT ILIKE '%in-person auto%'
    AND coalesce(notes,'') NOT ILIKE '%confirm parallel%' AND coalesce(parallel,'') NOT ILIKE '%(CONFIRM)%' ORDER BY asking_price_cents DESC`;
  const out: any[] = []; const graded: string[] = []; const longTitles: string[] = [];
  for (const r of rows) {
    const gradedFlag = /psa|bgs|sgc|cgc|graded/i.test(`${r.parallel || ''} ${r.notes || ''}`);
    if (gradedFlag) { graded.push(`id${r.id} ${r.player} #${r.card_number} [${r.parallel}] $${(r.asking_price_cents/100).toFixed(2)}`); continue; }
    const setBase = stripParens(r.set_name || '');
    const ins = insertName(r.set_name || '');
    const par = cleanParallel(r.parallel);
    const brand = /bowman/i.test(setBase) ? 'Bowman' : 'Topps';
    const tm = team(r.notes);
    const isAuto = /auto/i.test(r.parallel || '');
    const isRC = /\brc\b|rookie/i.test(r.notes || '');
    const hasRef = /refractor|prism|raywave/i.test(r.parallel || '');
    const serial = (r.parallel || '').match(/\/\d{1,4}/);
    const yearS = r.year ? String(r.year) : '';
    // set_name usually already starts with the year; only prepend if it doesn't
    const setDisplay = /^\d{4}\b/.test(setBase) || !yearS ? setBase : `${yearS} ${setBase}`;
    const title = capTitle([setDisplay, ins || '', r.player, par || ''].filter(Boolean), r.card_number);
    if (title.length >= 79) longTitles.push(`id${r.id}: ${title} (${title.length})`);
    const features: string[] = [];
    if (isRC) features.push('Rookie');
    if (hasRef) features.push('Refractor');
    if (serial) features.push('Serial Numbered');
    if (isAuto) features.push('Autograph');
    const aspects: any = {
      Sport: ['Baseball'], League: ['Major League Baseball (MLB)'], Type: ['Sports Trading Card'],
      Set: [setBase], Season: yearS ? [yearS] : undefined, Manufacturer: [brand],
      'Player/Athlete': [r.player], 'Card Name': [r.player],
      'Card Number': r.card_number ? [r.card_number] : undefined,
      Grade: ['Ungraded'], Graded: ['No'], Vintage: ['No'], Autographed: [isAuto ? 'Yes' : 'No'],
    };
    if (par) aspects['Parallel/Variety'] = [par];
    if (tm) aspects['Team'] = [tm];
    if (features.length) aspects['Features'] = features;
    Object.keys(aspects).forEach(k => aspects[k] === undefined && delete aspects[k]);
    const desc = `<p>${[setDisplay, ins, par].filter(Boolean).join(' ')} - ${r.player}${r.card_number ? ' #' + r.card_number : ''}${tm ? ', ' + tm : ''}.</p>`
      + `<p>Raw / ungraded, near mint or better. Stored in a penny sleeve and toploader, shipped protected between rigid cardboard with tracking. Ships within 1 business day.</p>`
      + `<p>Smoke-free home. Buy with confidence, check my feedback. Thanks for looking.</p>`;
    const priceDollars = (r.asking_price_cents / 100).toFixed(2);
    const overCap = r.asking_price_cents > 2000;
    out.push({
      id: r.id, sku: `BBC-${r.id}`, priceCents: r.asking_price_cents,
      product: { title, aspects, description: desc, brand, mpn: 'Does Not Apply', imageUrls: r.photo_urls },
      offer: {
        price: priceDollars, fulfillmentPolicyId: overCap ? GA : ESE,
        bestOffer: r.asking_price_cents >= 1000,
      },
    });
  }
  writeFileSync('scripts/listings_payload.json', JSON.stringify(out, null, 2));
  console.log(`built ${out.length} listing payloads -> scripts/listings_payload.json`);
  console.log(`GA (>$20): ${out.filter(o => o.priceCents > 2000).length} | eSE (<=$20): ${out.filter(o => o.priceCents <= 2000).length} | bestOffer: ${out.filter(o => o.offer.bestOffer).length}`);
  console.log(`\nEXCLUDED graded (${graded.length}) - list separately:`); graded.forEach(g => console.log('  ' + g));
  console.log(`\nlong titles (>=79): ${longTitles.length}`); longTitles.forEach(t => console.log('  ' + t));
  console.log('\nfirst 3 titles:'); out.slice(0, 3).forEach(o => console.log(`  [${o.sku}] ${o.product.title}`));
  await sql.end();
}
main().catch(e => { console.error(e); process.exit(1); });
