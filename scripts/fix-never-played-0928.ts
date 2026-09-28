/**
 * Strip "never played" from every BASEBALL listing.
 *
 *   npx tsx scripts/fix-never-played-0928.ts            # report
 *   npx tsx scripts/fix-never-played-0928.ts --apply    # fix
 *
 * "never played in the description? This isnt a TCG these are baeball cards
 * dont make me sound retarded"
 *
 * He is right. "Never played" is TCG condition language - it means the card was
 * never sleeved into a deck and played with. On a BASEBALL card it reads as
 * either nonsense or, worse, as a claim about the athlete. It came from the
 * sports template copying the Pokemon one.
 *
 * KEEP IT ON POKEMON. list-30th-singles-0917.ts and list-meowth-ex-0921.ts are
 * TCG singles where the phrase is correct and meaningful. Only the baseball
 * listings are wrong: scripts/list-bow3box-solo-0919.ts and
 * scripts/list-reynoso-goldink-0928.ts, both of which have been corrected at
 * source so the next listing does not reintroduce it.
 *
 * This walks the live book rather than a hardcoded id list, because the phrase
 * went out on every card that template produced.
 */
import { config } from 'dotenv';
import { readFileSync } from 'fs';
import { homedir } from 'os';
config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const BAD = /,?\s*never played\b\.?/gi;

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
  console.log(ids.length + ' active listings');

  let hit = 0, fixed = 0;
  for (const [id, title] of ids) {
    const v = await call('GetItem',
      '<ItemID>' + id + '</ItemID><DetailLevel>ReturnAll</DetailLevel><IncludeItemSpecifics>true</IncludeItemSpecifics>');
    const desc = v.match(/<Description>([\s\S]*?)<\/Description>/)?.[1] ?? '';
    if (!/never played/i.test(desc)) continue;

    // only baseball: the Pokemon singles legitimately say it
    const sport = /<Name>Sport<\/Name>\s*<Value>Baseball<\/Value>/i.test(v)
      || /baseball|bowman|topps chrome|finest/i.test(title);
    const pokemon = /pokemon/i.test(title) || /<Name>Game<\/Name>/i.test(v);
    hit++;
    if (pokemon || !sport) { console.log('  SKIP (TCG)  ' + id + '  ' + title.slice(0, 60)); continue; }

    const clean = desc.replace(BAD, '');
    if (clean === desc) { console.log('  no change   ' + id); continue; }
    console.log('  FIX  ' + id + '  ' + title.slice(0, 62));
    if (!APPLY) continue;
    const r = await call('ReviseFixedPriceItem',
      '<Item><ItemID>' + id + '</ItemID><Description><![CDATA[' + clean + ']]></Description></Item>');
    const ack = r.match(/<Ack>([^<]*)</)?.[1];
    if (ack === 'Failure') for (const m of r.matchAll(/<LongMessage>([^<]*)</g)) console.log('     ! ' + m[1].slice(0, 140));
    else fixed++;
  }
  console.log('\n' + hit + ' listings carried the phrase, ' + fixed + ' baseball listings fixed'
    + (APPLY ? '' : '  (dry run)'));
})();
