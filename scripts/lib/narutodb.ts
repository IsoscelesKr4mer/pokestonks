/**
 * narutodb.com client. Public JSON API at https://api.narutodb.com, no auth,
 * no key -- the site's own SPA calls it with a bare fetch. robots.txt allows
 * everything except user-specific pages (/collection, /settings, /trade...),
 * which we never touch.
 *
 * WHAT IT IS GOOD FOR
 *   The checklist. Every card in a set with its full number, rarity code,
 *   L-tier, character and an official thumbnail. That is the thing eBay cannot
 *   give us, and it means a card code Michael reads off a card can be VERIFIED
 *   rather than trusted.
 *
 * WHAT IT IS NOT GOOD FOR
 *   Confident pricing on its own. For Earth Scroll 2, 132 of 133 cards carry a
 *   price but:
 *     - 63 of them (48%) have source `fixed`, which is a placeholder, not a
 *       market observation. Every SR sits at exactly $1.00 and most R at $0.50.
 *     - 120 of 132 have sample_size 0, and only 12 have sample_size 1.
 *     - NOT ONE card has price_low != price_high, so there is no distribution
 *       anywhere in the feed. Each number is a single point estimate.
 *   Treat a narutodb price as one data point, and cross-check anything that
 *   matters against live eBay comps.
 *
 * The `merged_ebay_130point` rows are the best of the three sources: 130point
 * aggregates SOLD comps, which is exactly what eBay's Browse API cannot give us
 * (Browse returns active asks only). Those tend to read lower than asks, and
 * that gap is real, not an error.
 */

export type NarutoCard = {
  card_number: string;
  set_id: string;
  rarity_code: string;
  slot_number: number;
  l_tier: string | null;
  serial_text: string | null;
  character_name: string | null;
  is_promo: boolean;
  image_thumb_url: string | null;
  image_is_stand_in: boolean;
  featured_characters: string[];
};

export type NarutoPrice = {
  card_number: string;
  source: 'merged_ebay_130point' | 'ebay_scrape_auto' | 'fixed' | string;
  price_last_cents: number | null;
  price_avg_cents: number | null;
  price_low_cents: number | null;
  price_high_cents: number | null;
  sample_size: number;
  updated_at: string;
};

const BASE = 'https://api.narutodb.com';
const UA = 'pokestonks/1.0 (personal collection price research)';

async function get<T>(path: string): Promise<T> {
  const r = await fetch(`${BASE}${path}`, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  if (!r.ok) throw new Error(`narutodb ${r.status} ${r.statusText} on ${path}`);
  return r.json() as Promise<T>;
}

const unwrap = <T>(d: any, key: string): T[] =>
  Array.isArray(d) ? d : (d?.[key] ?? d?.data ?? []);

export const listSets = async () => unwrap<any>(await get('/api/sets'), 'sets');
export const listCardsInSet = async (setId: string) =>
  unwrap<NarutoCard>(await get(`/api/sets/${encodeURIComponent(setId)}/cards`), 'cards');
export const listAllPrices = async () =>
  unwrap<NarutoPrice>(await get('/api/prices'), 'prices');
export const getCard = (cardNumber: string) =>
  get<NarutoCard>(`/api/cards/${encodeURIComponent(cardNumber)}`);
export const getPrice = (cardNumber: string) =>
  get<NarutoPrice>(`/api/prices/${encodeURIComponent(cardNumber)}`);

/**
 * How much weight a price deserves. `fixed` with no samples is a placeholder
 * wearing a dollar sign; say so rather than quoting it as a comp.
 */
export function priceConfidence(p: NarutoPrice | undefined): 'none' | 'placeholder' | 'weak' | 'ok' {
  if (!p || p.price_last_cents == null) return 'none';
  if (p.source === 'fixed') return 'placeholder';
  if (!p.sample_size) return 'weak';
  return 'ok';
}

/** Resolve codes against the real checklist so a misread number fails loudly. */
export async function resolve(setId: string, codes: string[]) {
  const [cards, prices] = await Promise.all([listCardsInSet(setId), listAllPrices()]);
  const byNum = new Map(cards.map((c) => [c.card_number.toUpperCase(), c]));
  // Also index without the L-tier suffix: Michael reads codes off the card and
  // the L-tier is easy to drop or mistype.
  const byStem = new Map<string, NarutoCard[]>();
  for (const c of cards) {
    const stem = c.card_number.toUpperCase().replace(/L\d+$/, '');
    if (!byStem.has(stem)) byStem.set(stem, []);
    byStem.get(stem)!.push(c);
  }
  const priceBy = new Map(prices.map((p) => [p.card_number.toUpperCase(), p]));

  return codes.map((raw) => {
    const key = raw.trim().toUpperCase();
    let card = byNum.get(key);
    let note = '';
    if (!card) {
      const stem = key.replace(/L\d+$/, '');
      const hits = byStem.get(stem) ?? [];
      if (hits.length === 1) { card = hits[0]; note = `matched on stem, real code is ${card.card_number}`; }
      else if (hits.length > 1) note = `ambiguous stem, ${hits.length} candidates`;
    }
    const price = card ? priceBy.get(card.card_number.toUpperCase()) : undefined;
    return { input: raw, card, price, confidence: priceConfidence(price), note };
  });
}
