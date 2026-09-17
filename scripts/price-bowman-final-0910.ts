/**
 * Final prices for all 60 cards out of the 2026 Bowman Chrome hobby box.
 *
 * One script, one filter, so there is a single place to audit. It supersedes
 * the two earlier passes, which each got a different subset wrong.
 *
 * The base filter has to be much harsher than the shared library's, because
 * this product hides four different premium cards behind titles that look like
 * plain base cards and carry no serial:
 *
 *   Red Rookie variation   Murakami #76 base is $5.99, the Red Rookie is $50.
 *                          Three of four "base" comps were Red Rookies.
 *   Image Variation        Roman Anthony #43 base is $9.98, the image
 *                          variation is $189. Same card number, no serial.
 *   Case-hit SSPs          Peanuts / Snack Pack / Sunflower Seeds inserts run
 *                          $250-550 and say "1st Bowman <name> BCP-177".
 *   League Logofractor     $85 against a $2 base.
 *
 * None of those carry a serial or the word refractor, so nothing in the generic
 * filter excluded them and every one of them dragged a base median up.
 *
 * Parallel prices are NOT taken from a single median. Six of the ten have no
 * live listing of the exact card, which is normal on release day for a /25, so
 * they are read off the player's own parallel ladder (see MANUAL below) per
 * memory: a serial is a multiplier, not a floor.
 */
import { config } from 'dotenv';
import { readFileSync, writeFileSync } from 'fs';
import { browseToken, GRADED, pct } from './lib/card-comps';
config({ path: '.env.local' });

/** Prices settled by hand off each player's full ladder. See ladder script. */
const MANUAL: Record<number, { price: number; asks: number; note: string }> = {
  1: { price: 50.00, asks: 23, note: 'Red Rookie variation, 23 live asks, median $50 (base #76 is $6)' },
  2: { price: 55.00, asks: 17, note: 'Red Rookie variation, 17 live asks, median $55 (base #3 is $3)' },
  3: { price: 225.00, asks: 4, note: 'True Orange /25, 4 live asks $150/$200/$299/$455; the $150 is the only one that names BCP-174' },
  4: { price: 110.00, asks: 0, note: 'no live Orange /25 for this card. Off his own WBC ladder: /499 $15, Blue /150 $42, Green /99 $45, Gold /50 $75' },
  5: { price: 18.00, asks: 0, note: 'no live Refractor /499 for BCP-210. Off his own ladder: Purple Pulsar /250 $35, Blue Wave /150 $42' },
  6: { price: 13.00, asks: 0, note: 'no live Blue /150. Only 4 Woo listings exist at all: Silver Refractor /499 $9.99, Fuchsia /299 $8, Purple Wave /299 $9.95' },
  7: { price: 20.00, asks: 2, note: 'Purple /250, 2 live asks $12 and $40' },
  9: { price: 125.00, asks: 1, note: 'the one live /250 auto asks $499, which is an outlier against his own auto ladder: /299 $105, /99 $120, /75 $200. Priced to the ladder' },
  10: { price: 125.00, asks: 11, note: 'base auto, 11 live asks, median $125' },
  27: { price: 17.00, asks: 2, note: 'X-Fractor, 2 live asks $16.99 and $50; his Mojo refractors sit $10-20 at the same rarity' },
};

const NONBASE = ['refractor', 'raywave', 'ray wave', 'prism', 'mojo', 'laser', 'lazer', 'reptilian',
  'mini diamond', 'minidiamond', 'sapphire', 'x-fractor', 'xfractor', 'shimmer', 'pulsar', 'speckle',
  'geometric', 'wave', 'atomic', 'superfractor', 'logofractor', 'packfractor', 'popcorn', 'crystal',
  'peanuts', 'snack pack', 'sunflower', 'case hit', 'auto', 'signed'];
// Excluding a bare "break" to kill box-break listings also killed the entire
// Big Break insert, which is a real card in this box. Only the box-break
// phrasings are excluded.
const JUNK = /you pick|choose|lot of|minimum|box break|case break|live break|random |case hit/i;
/** Premium cards that share the base card number and carry no serial. */
const LOOKALIKE = /\bred rookie\b|\bred rc\b|red logo|image variation|redemption|variation|\bssp\b|\bsp\b/i;

function baseAccept(title: string, c: any) {
  const t = title.toLowerCase();
  if (GRADED.test(title)) return false;
  if (LOOKALIKE.test(title)) return false;
  const surname = c.player.split(' ').pop().toLowerCase();
  if (!t.includes(surname)) return false;
  if (!t.includes('bowman') || !t.includes('2026')) return false;
  if (JUNK.test(t)) return false;
  if (/\d{1,4}\s?\/\s?\d{1,4}|\/\s?\d{1,4}\b/.test(t)) return false;
  if (NONBASE.some(w => t.includes(w))) return false;
  // an insert must name its own set; a base card must not carry another code
  const num = String(c.card_number);
  if (/^[A-Z]/.test(num)) {
    const stripped = num.toLowerCase().replace(/[\s-]/g, '');
    if (!t.replace(/[\s-]/g, '').includes(stripped)) return false;
  } else {
    if (/\b(bcp|cpa|sf|tt|it|bb|sb|wbc|ur|btp|es|pc)-\s?\d/i.test(t)) return false;
  }
  return true;
}

/** Inserts keep the word Refractor out but must still name the insert. */
function insertAccept(title: string, c: any, insertName: string) {
  const t = title.toLowerCase();
  if (GRADED.test(title)) return false;
  const surname = c.player.split(' ').pop().toLowerCase();
  if (!t.includes(surname) || !t.includes('bowman') || !t.includes('2026')) return false;
  if (JUNK.test(t)) return false;
  if (/\d{1,4}\s?\/\s?\d{1,4}|\/\s?\d{1,4}\b/.test(t)) return false;
  if (/\bauto|autograph|signed/.test(t)) return false;
  const code = String(c.card_number).toLowerCase().replace(/[\s-]/g, '');
  return t.includes(insertName.toLowerCase()) || t.replace(/[\s-]/g, '').includes(code);
}

const insertOf = (setName: string) => {
  const m = setName.match(/\(([^)]+?)\s*insert\)/);
  return m ? m[1] : null;
};

(async () => {
  const cards = JSON.parse(readFileSync('scripts/_bow_cards.json', 'utf8'));
  const tok = await browseToken();
  const out: any[] = [];
  for (const c of cards) {
    if (MANUAL[c.i]) {
      const m = MANUAL[c.i];
      out.push({ ...c, price: m.price, asks: m.asks, source: 'ladder', note: m.note });
      console.log('#' + String(c.i).padStart(2) + ' ' + c.card_number.padEnd(8) + ' ' +
        c.player.slice(0, 20).padEnd(20) + ('$' + m.price.toFixed(2)).padStart(9) +
        ' (' + String(m.asks).padStart(2) + ' asks)  ' + c.parallel);
      continue;
    }
    const ins = insertOf(c.set_name);
    const isProspect = c.card_number.startsWith('BCP-');
    const q = (isProspect ? '2026 Bowman Chrome Prospects ' : '2026 Bowman Chrome ') +
      (ins ? ins + ' ' : '') + c.player;
    const url = 'https://api.ebay.com/buy/browse/v1/item_summary/search?q=' +
      encodeURIComponent(q) + '&category_ids=261328&limit=100';
    const r = await fetch(url, { headers: { Authorization: 'Bearer ' + tok, 'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US' } });
    const j: any = await r.json();
    const seen = new Map<string, number>();
    for (const it of j.itemSummaries || []) {
      const ok = ins ? insertAccept(it.title || '', c, ins) : baseAccept(it.title || '', c);
      if (!ok) continue;
      const v = Number(it.price?.value);
      if (v > 0 && v < 100000) seen.set(it.title, v);
    }
    const prices = [...seen.values()];
    const med = prices.length ? pct(prices, 0.5) : null;
    const flag = prices.length === 0 ? 'NO COMPS' : prices.length < 4 ? 'THIN(' + prices.length + ')' : '';
    out.push({ ...c, price: med, asks: prices.length, source: 'comps', note: flag ? 'thin market, ' + prices.length + ' live asks' : prices.length + ' live asks' });
    console.log('#' + String(c.i).padStart(2) + ' ' + c.card_number.padEnd(8) + ' ' +
      c.player.slice(0, 20).padEnd(20) + (med === null ? '     -   ' : ('$' + med.toFixed(2)).padStart(9)) +
      ' (' + String(prices.length).padStart(2) + ' asks) ' + flag);
    await new Promise(res => setTimeout(res, 140));
  }
  writeFileSync('scripts/_bow_final_prices.json', JSON.stringify(out, null, 1));
  const tot = out.reduce((s, x) => s + (x.price || 0), 0);
  const none = out.filter(x => !x.price).length;
  console.log('\ntotal book value $' + tot.toFixed(2) + ' across ' + (out.length - none) + ' priced cards; ' + none + ' unpriced');
})();
