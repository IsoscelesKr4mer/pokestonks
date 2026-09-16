/**
 * Put the "you get the card in the dropdown" line on every you-pick listing.
 *
 *   npx tsx scripts/add-youpick-dropdown-guard-0916.ts           # dry run
 *   npx tsx scripts/add-youpick-dropdown-guard-0916.ts --apply
 *
 * Michael: "We need to add to the description that all cards are based on the
 * dropdown and the photo."
 *
 * Two buyers hit the Topps Finest you-pick believing every card in it was a
 * Mini Diamond. One opened a refund request, one order had to be cancelled.
 * That listing has been fixed. Of his 13 active you-picks, it was the ONLY one
 * carrying any such line, so the same misread is live on the other 12.
 *
 * The guard goes first, ahead of whatever each description already says, and
 * each listing keeps its own body text.
 *
 * Deliberately generic wording. An audit of title-vs-dropdown flagged several
 * listings as promising a type that 0% of the dropdown matched, but most of
 * those are false alarms: on a single-insert listing like "Wrecking Crew
 * Insert" every card IS the insert, the labels just do not repeat the word. So
 * this does not name a parallel per listing, it states the rule that holds
 * everywhere: you get the one card you picked.
 *
 * Sends no Variations node, and diffs every variation's availability and price
 * before and after, because Quantity on a variation revise is AVAILABLE rather
 * than total and has silently refilled sold-out cards before.
 */
import { config } from 'dotenv';
import { readFileSync } from 'fs';
import { homedir } from 'os';
config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const ALREADY_DONE = '168622312679';   // Finest, fixed separately with its own wording

const GUARD =
  '<p><strong>You are buying the one card you select from the dropdown above, and only that card.</strong> ' +
  'Each dropdown option names the exact card and what it is, and the photo changes to that card when you ' +
  'select it. Any other card types named in the title are other options inside this same listing. ' +
  'Please check the dropdown label and the photo before buying.</p>';

function fk(o: any, k: string): string | undefined {
  if (o && typeof o === 'object') for (const kk of Object.keys(o)) {
    if (kk === k && typeof o[kk] === 'string') return o[kk];
    const r = fk(o[kk], k); if (r) return r;
  }
  return undefined;
}

async function userToken() {
  const cfg = JSON.parse(readFileSync(homedir() + '/.claude.json', 'utf8'));
  const j = await (await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(fk(cfg, 'EBAY_CLIENT_ID') + ':' + fk(cfg, 'EBAY_CLIENT_SECRET')).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(fk(cfg, 'EBAY_USER_REFRESH_TOKEN')!) +
      '&scope=' + encodeURIComponent('https://api.ebay.com/oauth/api_scope/sell.inventory'),
  })).json();
  if (!j.access_token) throw new Error('token refresh failed');
  return j.access_token as string;
}

async function trading(tok: string, call: string, body: string) {
  const r = await fetch('https://api.ebay.com/ws/api.dll', {
    method: 'POST',
    headers: {
      'X-EBAY-API-CALL-NAME': call, 'X-EBAY-API-SITEID': '0',
      'X-EBAY-API-COMPATIBILITY-LEVEL': '1193', 'X-EBAY-API-IAF-TOKEN': tok, 'Content-Type': 'text/xml',
    },
    body,
  });
  return r.text();
}

function unescapeHtml(s: string) {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'").replace(/&#093;/g, ']').replace(/&amp;/g, '&');
}

async function snapshot(tok: string, id: string) {
  const x = await trading(tok, 'GetItem',
    '<?xml version="1.0" encoding="utf-8"?><GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">' +
    '<ItemID>' + id + '</ItemID><DetailLevel>ReturnAll</DetailLevel></GetItemRequest>');
  const raw = x.match(/<Description>([\s\S]*?)<\/Description>/)?.[1] ?? '';
  const inner = raw.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/)?.[1] ?? unescapeHtml(raw);
  const vars = new Map<string, { avail: number; price: string }>();
  for (const v of x.matchAll(/<Variation>([\s\S]*?)<\/Variation>/g)) {
    const name = v[1].match(/<Name>Card[^<]*<\/Name><Value>([^<]*)</)?.[1] ?? '';
    const q = Number(v[1].match(/<Quantity>(\d+)</)?.[1] ?? 0);
    const s = Number(v[1].match(/<QuantitySold>(\d+)</)?.[1] ?? 0);
    vars.set(name, { avail: q - s, price: v[1].match(/<StartPrice[^>]*>([\d.]+)</)?.[1] ?? '' });
  }
  return { title: x.match(/<Title>([^<]*)</)?.[1] ?? '', desc: inner.replace(/&#093;&#093;&gt;\s*$/, '').trim(), vars };
}

(async () => {
  const tok = await userToken();
  const list = await trading(tok, 'GetMyeBaySelling',
    '<?xml version="1.0" encoding="utf-8"?><GetMyeBaySellingRequest xmlns="urn:ebay:apis:eBLBaseComponents">' +
    '<ActiveList><Include>true</Include><Pagination><EntriesPerPage>200</EntriesPerPage></Pagination></ActiveList>' +
    '</GetMyeBaySellingRequest>');
  const targets: string[] = [];
  for (const m of list.matchAll(/<Item>([\s\S]*?)<\/Item>/g)) {
    const t = m[1].match(/<Title>([^<]*)</)?.[1] ?? '';
    const id = m[1].match(/<ItemID>(\d+)</)?.[1] ?? '';
    if (/you pick/i.test(t) && id !== ALREADY_DONE) targets.push(id);
  }
  console.log('you-pick listings to guard: ' + targets.length + '\n');

  let done = 0; const failed: string[] = []; const problems: string[] = [];
  for (const id of targets) {
    const before = await snapshot(tok, id);
    if (/only that card|not every card|read the dropdown/i.test(before.desc)) {
      console.log('skip ' + id + ' (already guarded)  ' + before.title.slice(0, 54));
      continue;
    }
    console.log(id + '  ' + before.title.slice(0, 66));
    if (!APPLY) continue;

    const res = await trading(tok, 'ReviseFixedPriceItem',
      '<?xml version="1.0" encoding="utf-8"?><ReviseFixedPriceItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">' +
      '<ErrorLanguage>en_US</ErrorLanguage><WarningLevel>High</WarningLevel><Item><ItemID>' + id + '</ItemID>' +
      '<Description><![CDATA[' + GUARD + before.desc + ']]' + '></Description>' +
      '</Item></ReviseFixedPriceItemRequest>');
    const ack = res.match(/<Ack>(\w+)</)?.[1];
    if (ack === 'Failure') {
      failed.push(id + ': ' + (res.match(/<LongMessage>([^<]*)</)?.[1] ?? '').slice(0, 110));
      console.log('   FAILED');
      continue;
    }
    const after = await snapshot(tok, id);
    if (!/only that card/i.test(after.desc)) problems.push(id + ' guard did not land');
    if (after.title !== before.title) problems.push(id + ' title changed');
    if (after.vars.size !== before.vars.size) problems.push(id + ' variation count ' + before.vars.size + ' -> ' + after.vars.size);
    for (const [n, b] of before.vars) {
      const a = after.vars.get(n);
      if (!a) { problems.push(id + ' LOST ' + n); continue; }
      if (a.avail !== b.avail) problems.push(id + ' ' + n + ' availability ' + b.avail + ' -> ' + a.avail);
      if (a.price !== b.price) problems.push(id + ' ' + n + ' price ' + b.price + ' -> ' + a.price);
    }
    done++;
    console.log('   ok, ' + after.vars.size + ' variations untouched');
  }

  console.log('\nguarded ' + done + ' of ' + targets.length);
  failed.forEach((f) => console.log('   FAILED ' + f));
  problems.forEach((p) => console.log('   PROBLEM ' + p));
  if (!APPLY) console.log('\nDRY RUN, pass --apply');
})();
