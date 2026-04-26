export type Tokens = {
  text: string[];
  cardNumberFull: string | null;
  cardNumberPartial: string | null;
  setCode: string | null;
};

const RE_CARD_FULL = /^\d+\/\d+$/;
const RE_CARD_PARTIAL = /^\d{1,3}$/;
const RE_SET_CODE = /^[a-z]{2,4}\d+(?:pt\d+)?$/i;

export function tokenizeQuery(q: string): Tokens {
  const tokens = q.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const out: Tokens = { text: [], cardNumberFull: null, cardNumberPartial: null, setCode: null };
  for (const t of tokens) {
    if (RE_CARD_FULL.test(t)) {
      out.cardNumberFull = t;
    } else if (RE_CARD_PARTIAL.test(t)) {
      out.cardNumberPartial = t;
    } else if (RE_SET_CODE.test(t)) {
      out.setCode = t;
    } else {
      out.text.push(t);
    }
  }
  return out;
}
