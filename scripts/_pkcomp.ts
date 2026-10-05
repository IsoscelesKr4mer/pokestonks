import { config } from 'dotenv';
import { browseToken } from './lib/card-comps';
config({ path: '.env.local' });
const pct = (v: number[], p: number) => v[Math.min(v.length - 1, Math.floor(v.length * p))];
(async () => {
  const tok = await browseToken();
  const specs: [string, string, RegExp[], RegExp[], number, number][] = [
    ['Zapdos 133/128', 'pokemon 30th celebration zapdos 133/128',
      [/zapdos/i, /133/], [/\bpsa\b|\bbgs\b|\bcgc\b|graded|slab|\blot\b|proxy|custom|jumbo/i], 3, 200],
    ['Arceus VSTAR 123/172 (30th stamp)', 'pokemon 30th celebration arceus vstar 123/172',
      [/arceus/i, /vstar/i, /123/], [/\bpsa\b|\bbgs\b|\bcgc\b|graded|slab|\blot\b|proxy|custom/i], 2, 120],
    ['30th Pikachu variation singles', 'pokemon 30th celebration pikachu 128 variation',
      [/pikachu/i, /30th|celebration/i], [/\bpsa\b|\bbgs\b|\bcgc\b|graded|slab|proxy|custom|etb|elite trainer|bundle|pack|box/i], 0.5, 60],
  ];
  for (const [label, q, must, not, lo, hi] of specs) {
    const r = await fetch('https://api.ebay.com/buy/browse/v1/item_summary/search?limit=200&q=' +
      encodeURIComponent(q) + '&filter=' + encodeURIComponent('buyingOptions:{FIXED_PRICE}'),
      { headers: { Authorization: 'Bearer ' + tok, 'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US' } });
    const j: any = await r.json();
    const kept = (j.itemSummaries ?? []).filter((i: any) => {
      const t = i.title ?? '';
      if (!must.every((m) => m.test(t))) return false;
      if (not.some((n) => n.test(t))) return false;
      const p = Number(i.price?.value ?? 0);
      return p > lo && p < hi;
    });
    const v = kept.map((i: any) => Number(i.price?.value ?? 0)).sort((a: number, b: number) => a - b);
    console.log(`\n== ${label}   raw ${j.total ?? 0} -> kept ${v.length}`);
    if (!v.length) { console.log('   NO ASKS'); continue; }
    console.log(`   low $${v[0].toFixed(2)}  25th $${pct(v,0.25).toFixed(2)}  MED $${pct(v,0.5).toFixed(2)}  75th $${pct(v,0.75).toFixed(2)}`);
    kept.slice(0, 6).forEach((i: any) =>
      console.log('     $' + Number(i.price?.value ?? 0).toFixed(2).padStart(7) + '  ' + (i.title ?? '').slice(0, 68)));
  }
})();
