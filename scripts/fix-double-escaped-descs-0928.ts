/**
 * Repair the descriptions my own "never played" fix broke.
 *
 *   npx tsx scripts/fix-double-escaped-descs-0928.ts            # report
 *   npx tsx scripts/fix-double-escaped-descs-0928.ts --apply    # repair
 *
 * fix-never-played-0928.ts read each description with GetItem, edited the
 * string, and posted it back inside CDATA. **GetItem returns the description
 * HTML-ESCAPED**, so what went back was the literal text `&lt;p&gt;...`, and
 * every listing it touched now shows its own markup to buyers instead of
 * rendering it. Readback caught it:
 *
 *   168701941106  "Pulled from a 2026 Bowman Chrome mega box.&amp;lt;/p&amp;gt;..."
 *
 * The second bug in the same pass: the strip regex `/,?\s*never played\b\.?/`
 * ate the sentence's full stop along with the phrase, leaving
 * "sleeved straight away Photos are of the actual card".
 *
 * So: decode entities once, remove the phrase, restore the full stop, and only
 * write when the result actually renders as HTML. The guard below refuses to
 * send anything that still contains an escaped tag, because sending escaped
 * markup is exactly what caused this.
 */
import { config } from 'dotenv';
import { readFileSync } from 'fs';
import { homedir } from 'os';
config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');

// &amp; must be decoded LAST or "&amp;lt;" becomes "<" in one pass
const decode = (s: string) => s
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'")
  .replace(/&amp;/g, '&');

function fk(o: any, k: string): string | undefined {
  if (o && typeof o === 'object') {
    for (const kk of Object.keys(o)) {
      if (kk === k && typeof o[kk] === 'string') return o[kk];
      const r = fk(o[kk], k);
      if (r) return r;
    }
  }
  return undefined;
}

(async () => {
  const cfg = JSON.parse(readFileSync(homedir() + '/.claude.json', 'utf8'));
  const j: any = await (await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(fk(cfg, 'EBAY_CLIENT_ID') + ':' + fk(cfg, 'EBAY_CLIENT_SECRET')).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(fk(cfg, 'EBAY_USER_REFRESH_TOKEN')!)
      + '&scope=' + encodeURIComponent('https://api.ebay.com/oauth/api_scope/sell.inventory'),
  })).json();
  const tok = j.access_token;
  const call = async (n: string, b: string) => (await fetch('https://api.ebay.com/ws/api.dll', {
    method: 'POST',
    headers: {
      'X-EBAY-API-CALL-NAME': n, 'X-EBAY-API-SITEID': '0', 'X-EBAY-API-COMPATIBILITY-LEVEL': '1193',
      'X-EBAY-API-IAF-TOKEN': tok, 'Content-Type': 'text/xml',
    },
    body: '<?xml version="1.0" encoding="utf-8"?><' + n + 'Request xmlns="urn:ebay:apis:eBLBaseComponents">'
      + '<ErrorLanguage>en_US</ErrorLanguage><WarningLevel>High</WarningLevel>' + b + '</' + n + 'Request>',
  })).text();

  const ids: [string, string][] = [];
  for (let page = 1; page <= 4; page++) {
    const act = await call('GetMyeBaySelling',
      '<ActiveList><Sort>TimeLeft</Sort><Pagination><EntriesPerPage>200</EntriesPerPage>'
      + '<PageNumber>' + page + '</PageNumber></Pagination></ActiveList><DetailLevel>ReturnAll</DetailLevel>');
    const items = [...act.matchAll(/<Item>([\s\S]*?)<\/Item>/g)];
    if (!items.length) break;
    for (const m of items) {
      const g = (t: string) => m[1].match(new RegExp('<' + t + '[^>]*>([^<]*)<'))?.[1] ?? '';
      const id = g('ItemID');
      if (id && !ids.some(([x]) => x === id)) ids.push([id, g('Title')]);
    }
  }
  console.log(ids.length + ' active listings\n');

  let broken = 0, fixed = 0;
  for (const [id, title] of ids) {
    const v = await call('GetItem', '<ItemID>' + id + '</ItemID><DetailLevel>ReturnAll</DetailLevel>');
    const raw = v.match(/<Description>([\s\S]*?)<\/Description>/)?.[1] ?? '';
    if (!raw) continue;

    // one decode gives what is STORED. If that still holds escaped tags, the
    // stored value is escaped markup and buyers are seeing it as text.
    const stored = decode(raw);
    if (!/&lt;\s*\/?\s*(p|ul|li|strong|em|br)\b/i.test(stored)) continue;
    broken++;

    let html = decode(stored);
    const before = html;
    // the phrase itself, if any survived, plus the full stop the first pass ate
    html = html
      .replace(/,?\s*never played\b\.?/gi, '.')
      .replace(/straight away\s+Photos/g, 'straight away. Photos')
      .replace(/\.\s*\./g, '.');
    console.log((broken + '.').padStart(3) + ' ' + id + '  ' + title.slice(0, 58));
    console.log('     ' + (html.match(/Pulled[^<]*/)?.[0] ?? '').slice(0, 88));

    if (/&lt;|&gt;/.test(html)) { console.log('     REFUSED: still escaped'); continue; }
    if (!/^<p>/.test(html.trim())) { console.log('     REFUSED: does not open with a tag'); continue; }
    if (!APPLY) continue;

    const r = await call('ReviseFixedPriceItem',
      '<Item><ItemID>' + id + '</ItemID><Description><![CDATA[' + html + ']]></Description></Item>');
    if (r.match(/<Ack>([^<]*)</)?.[1] === 'Failure') {
      for (const m of r.matchAll(/<LongMessage>([^<]*)</g)) console.log('     ! ' + m[1].slice(0, 140));
    } else fixed++;
    void before;
  }
  console.log('\n' + broken + ' listings had escaped markup, ' + fixed + ' repaired'
    + (APPLY ? '' : '  (dry run)'));
})();
