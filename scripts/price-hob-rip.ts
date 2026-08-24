/**
 * Price every card from the 2026-08-24 two-Play-Booster Hobbit rip off Scryfall,
 * which carries TCGplayer prices per printing (nonfoil and foil separately).
 *
 *   npx tsx scripts/price-hob-rip.ts
 *
 * Collector numbers were read off the cards; that is the reliable key, not names.
 */
const CARDS: { n: number | string; name: string; foil?: boolean; token?: boolean }[] = [
  { n: 182, name: "Elvenking's Halls" },
  { n: 10,  name: 'Dwarven Shortsword', foil: true },
  { n: 92,  name: 'Desert Were-Worm' },
  { n: 125, name: "Galion, Elvenking's Butler" },
  { n: 22,  name: "The Mountain-king's Return" },
  { n: 52,  name: 'Ravenhill Flock' },
  { n: 38,  name: "Elvenking's Harper" },
  { n: 10,  name: 'Dwarven Shortsword' },
  { n: 116, name: 'Attercop' },
  { n: 157, name: 'Goblin Plate Mail' },
  { n: 21,  name: 'Moment of Glory' },
  { n: 43,  name: 'Lakeshore Apothecary' },
  { n: 85,  name: 'Stony-Voiced Goblins' },
  { n: 108, name: 'Ragged Short Spear' },
  { n: 2,   name: 'Human Soldier token', token: true },
  { n: 163, name: 'Silvan Reveler' },
  { n: 50,  name: "Old Fat Spider Can't See Me" },
  { n: 175, name: 'Key to the Side-Door' },
  { n: 162, name: 'Patient Instructor' },
  { n: 101, name: 'Gundabad Opportunist' },
  { n: 100, name: 'Goblin-town Flunkies' },
  { n: 133, name: 'Ordinary Bear' },
  { n: 18,  name: 'Lake-town Lookout' },
  { n: 35,  name: 'Confusticate and Bebother' },
  { n: 81,  name: 'Reverent Howl' },
  { n: 7,   name: 'Bear token', token: true },
  { n: 189, name: 'Plains', foil: true },
  { n: 63,  name: 'Crude Bent Blade', foil: true },
  { n: 4,   name: 'Belladonna Took' },
  { n: 187, name: 'The Lonely Mountain' },
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const rows: any[] = [];
  for (const c of CARDS) {
    const set = c.token ? 'thob' : 'hob';
    let j: any = null;
    try {
      const r = await fetch(`https://api.scryfall.com/cards/${set}/${c.n}`, {
        headers: { 'User-Agent': 'pokestonks/0.1', Accept: 'application/json' },
      });
      if (r.ok) j = await r.json();
    } catch {}
    await sleep(120);
    const usd = j?.prices?.usd ? Number(j.prices.usd) : null;
    const usdFoil = j?.prices?.usd_foil ? Number(j.prices.usd_foil) : null;
    const price = c.foil ? usdFoil ?? usd : usd;
    rows.push({ ...c, sc: j?.name ?? '(not found)', rarity: j?.rarity ?? '?', usd, usdFoil, price });
    console.log(
      `${String(c.n).padStart(4)} ${(c.foil ? '★' : ' ')} ${(j?.name ?? c.name).padEnd(30)} ${(j?.rarity ?? '?').padEnd(9)} ` +
      `nonfoil ${usd != null ? '$' + usd.toFixed(2) : '  —  '}  foil ${usdFoil != null ? '$' + usdFoil.toFixed(2) : '  —  '}  -> USING ${price != null ? '$' + price.toFixed(2) : 'n/a'}`
    );
  }
  const total = rows.reduce((s, r) => s + (r.price ?? 0), 0);
  const priced = rows.filter((r) => (r.price ?? 0) > 0);
  const over25 = rows.filter((r) => (r.price ?? 0) >= 0.25);
  const over1 = rows.filter((r) => (r.price ?? 0) >= 1);
  console.log(`\n30 cards, ${priced.length} with a price`);
  console.log(`TOTAL at comp: $${total.toFixed(2)}`);
  console.log(`cards >= $1.00: ${over1.length}  (${over1.map((r) => r.sc).join(', ')})`);
  console.log(`cards >= $0.25: ${over25.length}, summing $${over25.reduce((s, r) => s + r.price, 0).toFixed(2)}`);
  console.log(`cards <  $0.25: ${30 - over25.length}, summing $${(total - over25.reduce((s, r) => s + r.price, 0)).toFixed(2)}`);
}
main().catch((e) => { console.error(String(e).slice(0, 400)); process.exit(1); });
