/**
 * Card show cheat sheet, rebuilt 2026-09-05 around Michael's stated plan of
 * attack (voice note, on the drive over):
 *
 *   Trip 1  duffel of every bundle, aimed at ONE vendor as a single lot.
 *   Trip 2  back to the car for the One Piece and First Partner boxes.
 *   Trip 3  ask around on loose packs, sleeved first, as a last resort.
 *
 * The Ascended Heroes ETB is deliberately NOT here: he is holding it for years
 * and left it at home.
 *
 *   npx tsx scripts/cardshow-pdf-0905.ts
 *
 * Three corrections the raw percent-of-market ladder gets wrong, all applied:
 *   - Preorders (30th Celebration, Sep 16) are vault qty, not car qty.
 *   - TradePost's bid, net of freight, outranks 80% of market where it is higher.
 *   - A pack already sitting in a live art-set listing has an eBay net too, and
 *     selling it cheap at a table cannibalises that listing.
 */
import { readFileSync, writeFileSync } from 'fs';
import { chromium } from 'playwright';

type Row = {
  id: number; name: string; set_name: string | null; product_type: string | null;
  qty: number; mkt: number | null; wac: number; lotCostTotal: number;
  listedQty: number; listedIds: string[]; totalMkt: number;
  release_date: string | null; preorder: boolean;
};

/** The order he is walking things in. Anything unlisted here is not in the car. */
const TRIPS: { key: string; n: number; title: string; sub: string; ids: number[] }[] = [
  { key: 't1', n: 1, title: 'Bundles', sub: 'duffel, one vendor, all of them', ids: [17235, 76, 19776] },
  { key: 't2', n: 2, title: 'Boxes', sub: 'second trip to the car', ids: [135075, 196, 135080] },
  { key: 't3', n: 3, title: 'Loose packs', sub: 'price discovery, sleeved first, last resort', ids: [17232, 135074, 19928, 17236] },
];

/**
 * TradePost bids (Michael, 2026-09-05). He pays the label and box, so `freight`
 * comes off the bid. Freight is scaled from the one measured figure we have, a
 * 6-pack bundle at 5.6 oz ([[reference_shipping_package_specs]]): ~$14 postage
 * plus a $5 box over 9 bundles is $2.11 each; ~$25 plus $5 over 142 packs is
 * $0.21; the 20 Surging Sparks ride along in that same box for ~$0.10.
 * The bids are exact, the freight is an estimate.
 */
const TP: Record<number, { bid: number; freight: number }> = {};

/**
 * What a unit nets if the live listing it already sits in simply sells. eBay
 * fee is 13.25% of the whole order plus $0.40, so on a sub-$50 item use the
 * direct form rather than the x0.847 shortcut ([[reference_ebay_fee_rate]]):
 *   net = 0.85352*ask - 0.14648*ship - 0.40,  ship ~ $5 on a 4-pack.
 */
const perUnitNet = (ask: number, units: number, ship = 500) =>
  Math.round((0.85352 * ask - 0.14648 * ship - 40) / units);
const EBAY_NET: Record<number, { net: number; why: string }> = {};

/** Hand counts beat the vault for what is physically in the car. */
const COUNTED: Record<number, number> = {};

const rows: Row[] = JSON.parse(readFileSync('scripts/_cheatsheet_0905.json', 'utf8'));

const quantum = (c: number) => (c < 2000 ? 25 : 100);
const near = (c: number, q: number) => Math.round(c / q) * q;
const up = (c: number, q: number) => Math.ceil(c / q) * q;
const usd = (c: number) => `$${(c / 100).toFixed(2)}`;
const usd0 = (c: number) => `$${Math.round(c / 100).toLocaleString('en-US')}`;

const byId = new Map<number, Row>(rows.map((r) => [r.id, r]));
const preorders = rows.filter((r) => r.preorder);

const price = (r0: Row) => {
  const counted = COUNTED[r0.id];
  const r = counted == null || counted === r0.qty
    ? r0
    : { ...r0, qty: counted, lotCostTotal: r0.wac * counted, totalMkt: (r0.mkt ?? 0) * counted };
  const m = r.mkt!;
  const q = quantum(m);
  const tp = TP[r.id] ? TP[r.id].bid - TP[r.id].freight : 0;
  const eb = EBAY_NET[r.id]?.net ?? 0;
  const floor = Math.max(up(m * 0.8, q), tp, eb);
  const src = floor === eb && eb ? `eBay net on ${EBAY_NET[r.id].why}`
    : floor === tp && tp ? `TradePost ${usd(TP[r.id].bid)} net of freight`
      : '80% of market';
  return {
    ...r,
    p80: up(m * 0.8, q), p85: near(m * 0.85, q), p90: near(m * 0.9, q),
    p87: near(m * 0.87, q),
    floor, src, free: Math.max(0, r.qty - r.listedQty),
  };
};

const trips = TRIPS.map((t) => {
  // an item sold out during the show simply drops off the sheet
  const items = t.ids.filter((id) => byId.has(id)).map((id) => price(byId.get(id)!));
  const sum = (f: (x: (typeof items)[number]) => number) => items.reduce((s, x) => s + f(x), 0);
  return {
    ...t, items,
    units: sum((x) => x.qty),
    mkt: sum((x) => x.totalMkt),
    cost: sum((x) => x.lotCostTotal),
    ask: sum((x) => x.p90 * x.qty),
    settle: sum((x) => Math.max(x.p87, x.floor) * x.qty),
    walk: sum((x) => x.floor * x.qty),
    p85all: sum((x) => x.p85 * x.qty),
    committed: sum((x) => Math.min(x.listedQty, x.qty)),
  };
});

const G = {
  units: trips.reduce((s, t) => s + t.units, 0),
  mkt: trips.reduce((s, t) => s + t.mkt, 0),
  cost: trips.reduce((s, t) => s + t.cost, 0),
  ask: trips.reduce((s, t) => s + t.ask, 0),
  settle: trips.reduce((s, t) => s + t.settle, 0),
  walk: trips.reduce((s, t) => s + t.walk, 0),
};

const setLabel = (r: Row) => (r.set_name ?? '').replace(/^(SV\d+|ME|SV):\s*/, '');
const productLabel = (r: Row) => {
  const set = setLabel(r);
  const pre = [set, `Disney Lorcana: ${set}`, 'One Piece Card Game', 'First Partner']
    .filter(Boolean).sort((a, b) => b.length - a.length);
  let n = r.name;
  for (const p of pre) {
    if (n.toLowerCase().startsWith(p.toLowerCase())) { n = n.slice(p.length).trim(); break; }
  }
  return (n || r.name).replace(/Illustration/, 'Illus.');
};

const rowHtml = (r: ReturnType<typeof price>) => {
  const cell = (v: number, cls: string) => `<td class="p ${cls}">${usd(v)}</td>`;
  const qty = `<b>${r.qty}</b>`;
  return `<tr>
    <td class="nm"><b>${setLabel(r)}</b><span class="set">${productLabel(r)}</span></td>
    <td class="q">${qty}</td>
    <td class="cost"><b>${usd(r.wac)}</b><span class="lot">${usd(r.lotCostTotal)} all ${r.qty}</span></td>
    <td class="mkt">${usd(r.mkt!)}</td>
    ${cell(r.p80, 'p80')}${cell(r.p85, 'p85')}${cell(r.p90, 'p90')}
  </tr>`;
};

const tripHtml = (t: (typeof trips)[number]) => `
<div class="trip">
  <div class="th"><span class="n">${t.n}</span><b>${t.title}</b><span class="sub">${t.sub}</span>
    <span class="cnt">${t.units} units &middot; ${usd0(t.cost)} cost &middot; ${usd0(t.mkt)} market</span></div>
  ${t.n === 1 ? `<div class="bulk">
      <div><div class="k">Open at &middot; 90%</div><div class="v ask">${usd0(t.ask)}</div></div>
      <div><div class="k">Settle &middot; 87%</div><div class="v mid">${usd0(t.settle)}</div></div>
      <div><div class="k">Still fine &middot; 85%</div><div class="v mid2">${usd0(t.p85all)}</div></div>
      <div><div class="k">Walk below &middot; 80%</div><div class="v low">${usd0(t.walk)}</div></div>
      <div class="say">All ${t.units} bundles, one vendor. Lead with the comp:
        <b>${usd0(t.mkt)} of TCGplayer market</b>, you are asking
        ${((t.ask / t.mkt) * 100).toFixed(0)}% and will take
        ${((t.settle / t.mkt) * 100).toFixed(0)}%. You only have
        ${usd0(t.ask - t.walk)} of room, so do not open low.
        <br>Cost basis on the duffel is <b>${usd(t.cost)}</b>, so the walk number still clears
        <b>${usd0(t.walk - t.cost)}</b>.</div>
    </div>` : ''}
  <table>
    <colgroup><col style="width:28%"><col style="width:8%"><col style="width:14%"><col style="width:12%">
      <col style="width:12%"><col style="width:13%"><col style="width:13%"></colgroup>
    <thead><tr><th class="l">Item</th><th>Qty</th><th>Cost</th><th>Market</th>
      <th>80% floor</th><th>85% ask</th><th>90% great</th></tr></thead>
    <tbody>${t.items.map(rowHtml).join('')}</tbody>
  </table>
</div>`;


const html = `<!doctype html><meta charset="utf-8"><title>Card Show Cheat Sheet</title>
<style>
  @page { size: letter portrait; margin: 0.3in 0.4in; }
  * { box-sizing: border-box; }
  body { font: 9.5pt/1.3 -apple-system, "Segoe UI", system-ui, sans-serif; color: #14181d; margin: 0; }
  header { display: flex; align-items: baseline; justify-content: space-between;
           border-bottom: 2.5px solid #14181d; padding-bottom: 4px; margin-bottom: 7px; }
  h1 { font-size: 15pt; margin: 0; letter-spacing: -0.4px; }
  .when { font-size: 7.5pt; color: #5b6672; text-align: right; }

  .trip { margin-bottom: 8px; }
  .th { display: flex; align-items: baseline; gap: 7px; margin-bottom: 3px; }
  .th .n { display: inline-block; width: 17px; height: 17px; border-radius: 50%; background: #14181d;
           color: #fff; font-size: 9pt; font-weight: 700; text-align: center; line-height: 17px; }
  .th b { font-size: 12pt; letter-spacing: -0.3px; }
  .th .sub { font-size: 8pt; color: #6b7681; }
  .th .cnt { margin-left: auto; font-size: 8pt; color: #5b6672; font-variant-numeric: tabular-nums; }

  .bulk { display: grid; grid-template-columns: repeat(4, 1fr) 2.2fr; gap: 7px; margin-bottom: 5px;
          border: 1.5px solid #14181d; border-radius: 5px; padding: 6px 8px; background: #fafbfc; }
  .bulk .k { font-size: 7pt; text-transform: uppercase; letter-spacing: 0.4px; color: #5b6672; }
  .bulk .v { font-size: 15pt; font-weight: 700; letter-spacing: -0.8px; line-height: 1.1; }
  .bulk .ask { color: #1a6b3c; } .bulk .mid { color: #6b4b00; }
  .bulk .mid2 { color: #8a6100; } .bulk .low { color: #b3261e; }
  .bulk .say { font-size: 7.5pt; color: #3d454d; line-height: 1.3; border-left: 1px solid #d4dade;
               padding-left: 8px; }

  table { width: 100%; border-collapse: collapse; }
  thead th { font-size: 6.5pt; text-transform: uppercase; letter-spacing: 0.4px; color: #5b6672;
             text-align: right; padding: 0 4px 3px; border-bottom: 1.5px solid #14181d; font-weight: 700; }
  thead th.l { text-align: left; }
  td { padding: 2.5px 4px; border-bottom: 1px solid #e4e8ec; text-align: right;
       font-variant-numeric: tabular-nums; }
  tbody tr:nth-child(even) { background: #f7f9fa; }
  .nm { text-align: left; line-height: 1.15; }
  .nm b { font-size: 9.5pt; font-weight: 600; display: block; }
  .set { font-size: 6.5pt; color: #6b7681; }
  .q b { font-size: 10.5pt; } .q .of { font-size: 6.5pt; color: #6b7681; display: block; }
  .mkt { font-weight: 600; }
  .cost { line-height: 1.1; color: #5b6672; }
  .cost b { font-size: 9.5pt; color: #14181d; display: block; font-weight: 600; }
  .cost .lot { font-size: 6.2pt; }
  .p { font-weight: 700; font-size: 10pt; }
  .p80 { color: #b3261e; } .p90 { color: #1a6b3c; }
  .p85 { background: #fdf7e8; color: #6b4b00; font-size: 11.5pt; }
  .under { color: #b9c1c8 !important; background: none !important; font-weight: 400 !important;
           font-size: 9pt !important; text-decoration: line-through; }

  .warn { border: 1.5px solid #b3261e; border-radius: 5px; background: #fdf1f0; padding: 5px 9px;
          font-size: 7.5pt; color: #5c231f; line-height: 1.35; margin-bottom: 6px; }
  .warn .t { font-weight: 700; color: #7d1a15; text-transform: uppercase; letter-spacing: 0.3px;
             font-size: 8pt; }
  .notes { border-top: 1px solid #d4dade; padding-top: 5px; font-size: 7.2pt; color: #3d454d; }
  .notes b { color: #14181d; }
  .notes li { margin-bottom: 1.5px; }
  ul { margin: 0; padding-left: 14px; }
</style>

<header>
  <h1>Card Show Plan of Attack</h1>
  <div class="when">Saturday, September 5, 2026 &middot; TCGplayer market as of Sep 4<br>
    ${G.units} units in the car &middot; ${usd0(G.mkt)} market &middot; ${usd0(G.cost)} cost</div>
</header>

${trips.filter((t) => t.items.length).map(tripHtml).join('')}

<div class="notes"><ul>
  <li><b>The room is bidding 70-75%, so Destined Rivals bundles have a hard stop at $59.</b>
      That is what TradePost nets you after freight, and it is more than a 75% table offer of $51.
      Below $59 stop selling here and mail them: all five together net $294 through TradePost,
      which even 85% of market ($285) does not beat.</li>
  <li><b>Lead with the comp, not the price.</b> "TCGplayer market on these is ${usd0(trips[0].mkt)}
      for the twelve. I'm at ${usd0(trips[0].ask)}." Let him counter into the middle. The per-bundle
      column is there so you can price any subset on the spot if he only wants some.</li>
  <li><b>Why 80% is the floor.</b> eBay nets 84.7% of your ask and you list under market, so a
      completed eBay sale lands near 79% of market. Cash at 80% ties that with no fee, no label and
      no wait. Your measured card show clear on bundles has been 87%, which is the settle number.</li>
  <li><b>Sleeved beats loose.</b> Sleeved Destined Rivals market is ${usd(byId.get(17232)!.mkt!)}
      against ${usd(byId.get(17236)!.mkt!)} loose, so quote them separately and lead with sleeved.</li>
  <li><b>These are rounded.</b> Quarters under $20, dollars above. The 80% column rounds up so it is
      a true floor; 85% and 90% round to nearest and can sit under a point. Worst gap is 94 cents.</li>
  <li><b>Not in the car:</b> the Ascended Heroes ETB (holding it), and ${preorders.reduce((s, r) => s + r.qty, 0)}
      units of 30th Celebration that do not release until Sep 16.</li>
</ul></div>`;

writeFileSync('scripts/_cardshow_0905.html', html);

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.setContent(html, { waitUntil: 'load' });
  const out = 'eBay_assets/cardshow_cheatsheet_2026-09-05.pdf';
  await p.pdf({ path: out, format: 'Letter', printBackground: true, preferCSSPageSize: true });
  await b.close();
  console.log('wrote', out);
  for (const t of trips) {
    console.log(`Trip ${t.n} ${t.title}: ${t.units}u mkt ${usd(t.mkt)} | ask ${usd(t.ask)} settle ${usd(t.settle)} walk ${usd(t.walk)} | committed ${t.committed}`);
    for (const r of t.items) console.log(`    ${r.name}: q${r.qty} free${r.free} floor ${usd(r.floor)} (${r.src})`);
  }
  console.log(`ALL: ${G.units}u mkt ${usd(G.mkt)} cost ${usd(G.cost)} | ask ${usd(G.ask)} settle ${usd(G.settle)} walk ${usd(G.walk)}`);
})();
