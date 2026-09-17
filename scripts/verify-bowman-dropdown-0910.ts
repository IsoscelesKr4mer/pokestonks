/**
 * Dry-run the 45-card you-pick through VerifyAddFixedPriceItem.
 *
 *   npx tsx scripts/verify-bowman-dropdown-0910.ts
 *
 * eBay validates the whole payload, prices the insertion fee and returns the
 * exact errors a real AddFixedPriceItem would hit, WITHOUT creating a listing.
 * Memory says to always verify first; a required aspect can be non-variation
 * enabled and you only find out here.
 *
 * This call cannot list anything. The publishing script is separate.
 */
import { config } from 'dotenv';
import { readFileSync } from 'fs';
import { homedir } from 'os';
config({ path: '.env.local' });

function findKey(o: any, k: string): string | undefined {
  if (o && typeof o === 'object') {
    for (const kk of Object.keys(o)) {
      if (kk === k && typeof o[kk] === 'string') return o[kk];
      const r = findKey(o[kk], k); if (r) return r;
    }
  }
  return undefined;
}

async function userToken() {
  const cfg = JSON.parse(readFileSync(homedir() + '/.claude.json', 'utf8'));
  const r = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(findKey(cfg, 'EBAY_CLIENT_ID') + ':' + findKey(cfg, 'EBAY_CLIENT_SECRET')).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(findKey(cfg, 'EBAY_USER_REFRESH_TOKEN')!) +
      '&scope=' + encodeURIComponent('https://api.ebay.com/oauth/api_scope/sell.inventory'),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error('token refresh failed: ' + JSON.stringify(j));
  return j.access_token as string;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function toXml(node: any, name?: string): string {
  if (Array.isArray(node)) return node.map((n) => toXml(n, name)).join('');
  if (node !== null && typeof node === 'object') {
    const inner = Object.entries(node).map(([k, v]) => toXml(v, k)).join('');
    return name ? '<' + name + '>' + inner + '</' + name + '>' : inner;
  }
  const text = typeof node === 'string' ? esc(node) : String(node);
  return name ? '<' + name + '>' + text + '</' + name + '>' : text;
}

(async () => {
  const item = JSON.parse(readFileSync('scripts/_bow_trading.json', 'utf8'));
  const tok = await userToken();
  const xml = '<?xml version="1.0" encoding="utf-8"?>' +
    '<VerifyAddFixedPriceItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">' +
    '<ErrorLanguage>en_US</ErrorLanguage><WarningLevel>High</WarningLevel>' +
    toXml(item, 'Item') +
    '</VerifyAddFixedPriceItemRequest>';

  console.log('payload ' + xml.length + ' bytes, ' + item.Variations.Variation.length + ' variations');
  const r = await fetch('https://api.ebay.com/ws/api.dll', {
    method: 'POST',
    headers: {
      'X-EBAY-API-CALL-NAME': 'VerifyAddFixedPriceItem',
      'X-EBAY-API-SITEID': '0',
      'X-EBAY-API-COMPATIBILITY-LEVEL': '1193',
      'X-EBAY-API-IAF-TOKEN': tok,
      'Content-Type': 'text/xml',
    },
    body: xml,
  });
  const text = await r.text();
  const ack = text.match(/<Ack>(\w+)<\/Ack>/)?.[1];
  console.log('Ack: ' + ack);
  const fees = [...text.matchAll(/<Fee>.*?<Name>([^<]+)<\/Name>.*?<Fee currencyID="USD">([\d.]+)<\/Fee>.*?<\/Fee>/gs)]
    .filter((m) => Number(m[2]) > 0);
  if (fees.length) {
    console.log('fees eBay would charge to list:');
    fees.forEach((m) => console.log('   ' + m[1] + ': $' + m[2]));
  } else console.log('no listing fees');
  for (const m of text.matchAll(/<Errors>(.*?)<\/Errors>/gs)) {
    const blk = m[1];
    const sev = blk.match(/<SeverityCode>(\w+)<\/SeverityCode>/)?.[1];
    const msg = blk.match(/<LongMessage>([^<]*)<\/LongMessage>/)?.[1]
      || blk.match(/<ShortMessage>([^<]*)<\/ShortMessage>/)?.[1];
    console.log('  [' + sev + '] ' + msg);
  }
  if (ack !== 'Success' && ack !== 'Warning') console.log('\n' + text.slice(0, 1500));
})();
