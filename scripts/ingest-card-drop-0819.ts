/**
 * Ingest the 2026-08-19 X-Fractor drop: 57 cards from the Topps Chrome mega
 * ripfest, photographed as IMG_1667-1780 (front, back, front, back...).
 *
 *   npx tsx scripts/ingest-card-drop-0819.ts           # dry run
 *   npx tsx scripts/ingest-card-drop-0819.ts --apply
 *
 * PARITY: clean odd=front / even=back across the whole range. 1667-1780 is
 * contiguous with no gaps, so no parity flip to worry about.
 *
 * EVERY CARD IS AN X-FRACTOR. Checkerboard on all 57 fronts, and no REFRACTOR
 * under @TOPPS on any of the 57 backs. Nothing is flagged confirm parallel.
 *
 * NINE PAIRS REPEAT A PLAYER AND THESE ARE REAL SECOND AND THIRD COPIES, not
 * re-shoots. I read the shape wrong first time: cards 49-57 repeat the same
 * seven players as cards 1-9, which looked exactly like a re-photographed bad
 * first pass. Michael: "Every card in this photo lot was unique. There were
 * indeed 3 Josh bells." So all 57 go in as their own rows.
 *   #261 Jakob Marsee   x3   IMG_1667, 1675, 1767
 *   #24  Josh Bell      x3   IMG_1679, 1683, 1779
 *   #115 Owen Caissie   x2   #19 Heriberto Hernandez x2   #209 Caleb Durbin x2
 *   #22  Mason Barnett  x2   #247 Warming Bernabel   x2
 * Lesson: a repeat inside one drop is a question for Michael, not an inference
 * from photo order. Enough megas produce genuine triples.
 *
 * THIRTEEN ALSO DUPLICATE AN X-FRACTOR ALREADY IN THE VAULT from earlier rips
 * (#13, 29, 36, 58, 61, 92, 126, 141, 143, 184, 229, 242, 277). Those are
 * second physical copies too; they are printed in the run output so they can be
 * checked against the team bags.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const UID = '66200525-2237-4cc3-948f-aaafd3253d4b';
const BUCKET = 'ebay-listings';
const PUB = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET}/`;
const DIR = 'eBay_assets/card drop';
const RIP = 'From the 2026-08-19 rip of Topps Chrome baseball megas.';
const CHROME = '2026 Topps Chrome';
const X = 'X-Fractor';

type Row = { player: string; num: string; front: number; back: number; rc?: boolean };

const CARDS: Row[] = [
  { player: "Jakob Marsee", num: "261", front: 1667, back: 1668, rc: true },
  { player: "Owen Caissie", num: "115", front: 1669, back: 1670, rc: true },
  { player: "Heriberto Hernandez", num: "19", front: 1671, back: 1672, rc: true },
  { player: "Caleb Durbin", num: "209", front: 1673, back: 1674 },
  { player: "Jakob Marsee", num: "261", front: 1675, back: 1676, rc: true },
  { player: "Mason Barnett", num: "22", front: 1677, back: 1678, rc: true },
  { player: "Josh Bell", num: "24", front: 1679, back: 1680 },
  { player: "Warming Bernabel", num: "247", front: 1681, back: 1682, rc: true },
  { player: "Josh Bell", num: "24", front: 1683, back: 1684 },
  { player: "Drew Gilbert", num: "126", front: 1685, back: 1686, rc: true },
  { player: "Yusei Kikuchi", num: "36", front: 1687, back: 1688 },
  { player: "Parker Messick", num: "184", front: 1689, back: 1690, rc: true },
  { player: "Kyle Tucker", num: "58", front: 1691, back: 1692 },
  { player: "Otto Kemp", num: "229", front: 1693, back: 1694, rc: true },
  { player: "Nolan Schanuel", num: "94", front: 1695, back: 1696 },
  { player: "Chase Burns", num: "134", front: 1697, back: 1698, rc: true },
  { player: "Jazz Chisholm Jr.", num: "61", front: 1699, back: 1700 },
  { player: "Chase Dollander", num: "277", front: 1701, back: 1702 },
  { player: "Carter Jensen", num: "39", front: 1703, back: 1704, rc: true },
  { player: "Royce Lewis", num: "151", front: 1705, back: 1706 },
  { player: "Mike Yastrzemski", num: "178", front: 1707, back: 1708 },
  { player: "Spencer Torkelson", num: "289", front: 1709, back: 1710 },
  { player: "Seiya Suzuki", num: "34", front: 1711, back: 1712 },
  { player: "Chris Bassitt", num: "42", front: 1713, back: 1714 },
  { player: "Carson Whisenhunt", num: "142", front: 1715, back: 1716, rc: true },
  { player: "Shinnosuke Ogasawara", num: "64", front: 1717, back: 1718, rc: true },
  { player: "Moises Ballesteros", num: "264", front: 1719, back: 1720 },
  { player: "Jhostynxon Garcia", num: "70", front: 1721, back: 1722, rc: true },
  { player: "Brady House", num: "189", front: 1723, back: 1724, rc: true },
  { player: "Hurston Waldrep", num: "141", front: 1725, back: 1726 },
  { player: "Christian Moore", num: "232", front: 1727, back: 1728, rc: true },
  { player: "Taylor Walls", num: "104", front: 1729, back: 1730 },
  { player: "Nico Hoerner", num: "29", front: 1731, back: 1732 },
  { player: "Kyle Karros", num: "13", front: 1733, back: 1734, rc: true },
  { player: "Tatsuya Imai", num: "242", front: 1735, back: 1736, rc: true },
  { player: "Gabriel Moreno", num: "92", front: 1737, back: 1738 },
  { player: "Zach Maxwell", num: "143", front: 1739, back: 1740, rc: true },
  { player: "Cal Raleigh", num: "9", front: 1741, back: 1742 },
  { player: "Denzel Clarke", num: "246", front: 1743, back: 1744 },
  { player: "Devin Williams", num: "194", front: 1745, back: 1746 },
  { player: "Hunter Goodman", num: "207", front: 1747, back: 1748 },
  { player: "Harry Ford", num: "56", front: 1749, back: 1750, rc: true },
  { player: "Zach Neto", num: "77", front: 1751, back: 1752 },
  { player: "T.J. Rumfield", num: "181", front: 1753, back: 1754, rc: true },
  { player: "Wilyer Abreu", num: "165", front: 1755, back: 1756 },
  { player: "Ernie Clement", num: "106", front: 1757, back: 1758 },
  { player: "Aaron Judge", num: "100", front: 1759, back: 1760 },
  { player: "Sal Stewart", num: "6", front: 1761, back: 1762, rc: true },
  { player: "Owen Caissie", num: "115", front: 1763, back: 1764, rc: true },
  { player: "Heriberto Hernandez", num: "19", front: 1765, back: 1766, rc: true },
  { player: "Jakob Marsee", num: "261", front: 1767, back: 1768, rc: true },
  { player: "Mason Barnett", num: "22", front: 1769, back: 1770, rc: true },
  { player: "Warming Bernabel", num: "247", front: 1771, back: 1772, rc: true },
  { player: "Caleb Durbin", num: "209", front: 1773, back: 1774 },
  { player: "Marcelo Mayer", num: "88", front: 1775, back: 1776 },
  { player: "Luis Castillo", num: "62", front: 1777, back: 1778 },
  { player: "Josh Bell", num: "24", front: 1779, back: 1780 },
];

const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  if (CARDS.length !== 57) { console.error(`expected 57 cards, got ${CARDS.length}`); process.exit(1); }

  const missing: string[] = [];
  for (const c of CARDS) for (const n of [c.front, c.back]) {
    if (!existsSync(`${DIR}/IMG_${n}.JPEG`)) missing.push(`IMG_${n}.JPEG (${c.player})`);
  }
  if (missing.length) { console.error('MISSING PHOTOS: ' + missing.join(', ')); process.exit(1); }

  const claimed = new Map<number, string>();
  for (const c of CARDS) for (const n of [c.front, c.back]) {
    if (claimed.has(n)) { console.error(`IMG_${n} claimed by both ${claimed.get(n)} and ${c.player}`); process.exit(1); }
    claimed.set(n, c.player);
  }
  // only this drop's range; the folder also holds older 1588-1629 stragglers
  const unused: number[] = [];
  for (let n = 1667; n <= 1780; n++) if (existsSync(`${DIR}/IMG_${n}.JPEG`) && !claimed.has(n)) unused.push(n);
  if (unused.length) { console.error(`photos in range not claimed: ${unused.join(', ')}`); process.exit(1); }
  console.log(`${claimed.size} photos claimed by ${CARDS.length} cards, none double-claimed, none orphaned`);

  const dupes: any = await sql`
    SELECT id, player, card_number, parallel, status FROM baseball_cards
    WHERE card_number = ANY(${CARDS.map((c) => c.num)}) AND set_name = ${CHROME} AND parallel ILIKE '%x-fractor%'
    ORDER BY card_number`;
  if (dupes.length) {
    console.log('ALREADY IN THE VAULT as a Chrome X-Fractor (second physical copies, check the bags):');
    for (const d of dupes) console.log(`  #${d.id} ${d.card_number} ${d.player} [${d.status}]`);
    console.log('');
  }

  const seen = new Map<string, number>();
  for (const c of CARDS) {
    const k = `${c.num}|${c.player}`;
    seen.set(k, (seen.get(k) ?? 0) + 1);
  }
  const multi = [...seen.entries()].filter(([, n]) => n > 1);
  if (multi.length) {
    console.log('MULTIPLE COPIES INSIDE THIS DROP (confirmed real by Michael):');
    for (const [k, n] of multi) console.log(`  ${k.replace('|', ' ')} x${n}`);
    console.log('');
  }

  if (!APPLY) {
    for (const c of CARDS) console.log(`  #${c.num.padEnd(4)} ${c.player}${c.rc ? ' (RC)' : ''}`);
    console.log('dry run');
    await sql.end(); return;
  }

  let n = 0;
  for (const c of CARDS) {
    const urls: string[] = [];
    for (const img of [c.front, c.back]) {
      const key = `bbcard_drop_${img}.jpg`;
      const buf = readFileSync(`${DIR}/IMG_${img}.JPEG`);
      const { error } = await sb.storage.from(BUCKET).upload(key, buf, { contentType: 'image/jpeg', upsert: true });
      if (error) { console.error(`upload failed ${key}: ${error.message}`); process.exit(1); }
      urls.push(PUB + key);
    }
    const [row] = await sql`
      INSERT INTO baseball_cards (user_id, player, set_name, year, card_number, parallel, sport,
                                  status, for_sale, photo_urls, needs_back_photo, notes)
      VALUES (${UID}, ${c.player}, ${CHROME}, 2026, ${c.num}, ${X}, 'Baseball',
              'photographed', true, ${urls}, false, ${RIP})
      RETURNING id`;
    n++;
    console.log(`  #${row.id} ${c.num} ${c.player}`);
  }
  console.log(`${n} cards ingested.`);
  await sql.end();
}
main().catch((e) => { console.error(String(e).slice(0, 800)); process.exit(1); });
