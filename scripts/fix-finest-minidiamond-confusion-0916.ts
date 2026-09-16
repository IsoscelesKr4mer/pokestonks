/**
 * Stop buyers thinking every card in the Finest you-pick is a Mini Diamond.
 *
 *   npx tsx scripts/fix-finest-minidiamond-confusion-0916.ts           # dry run
 *   npx tsx scripts/fix-finest-minidiamond-confusion-0916.ts --apply
 *
 * Michael: "ive had multiple people try and buy from my topps finest listing
 * thinking it's mini diamonds they are purchasing when it's not... I had one
 * guy request a refund and then cancel... and now I just had to cancel an
 * order after someone said 'im getting mini diamonds, right'."
 *
 * He asked for a description line. Worth adding, but the description is not
 * the cause. The title is:
 *
 *   2026 Topps Finest Baseball You Pick Card Mini Diamond Refractor Insert RC
 *
 * "Mini Diamond" sits immediately after "You Pick Card", so it reads as the
 * thing being sold. Only 12 of the 54 available variations are Mini Diamonds;
 * the other 42 are base, inserts and other refractors. Buyers are not being
 * careless so much as reading the title the way it is written.
 *
 * Fix is to lead the type list with "Base" so the tail reads as a menu of what
 * the listing contains rather than a description of the card:
 *
 *   2026 Topps Finest Baseball You Pick Card Base Insert Refractor Mini Diamond RC
 *
 * Every keyword survives, Mini Diamond included, which 12 real cards need for
 * search. Only the order changes.
 *
 * The description then says it outright on the first line, ahead of the
 * boilerplate. This also repairs a malformed CDATA close that was rendering a
 * literal "]]>" at the end of the old description.
 *
 * Sends no Variations node: Quantity on a variation revise is AVAILABLE, not
 * total, and that has refilled sold-out cards before. Availability and price
 * are diffed across all 55 afterwards.
 */
import { config } from 'dotenv';
import { readFileSync } from 'fs';
import { homedir } from 'os';
config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const ITEM = '168622312679';
const TITLE = '2026 Topps Finest Baseball You Pick Card Base Insert Refractor Mini Diamond RC';

const DESC =
  '<p><strong>You are buying the one card you select from the dropdown above, and only that card.</strong></p>' +
  '<p><strong>Not every card in this listing is a Mini Diamond.</strong> The title lists the card types this listing contains: base, inserts, refractors and Mini Diamond refractors. Each dropdown option states exactly which one it is, and the photo changes to that exact card when you select it. Please read the dropdown label and check the photo before buying.</p>' +
  '<p>2026 Topps Finest singles. Raw and ungraded, near mint or better. Each card ships in a penny sleeve and a toploader or Card Saver I, with tracking. Ships within 1 business day.</p>' +
  '<p>Buying several? Add them all to your cart and they ship together in one package.</p>' +
  '<p>Smoke-free home. Buy with confidence, check my feedback. Thanks for looking.</p>';

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

async function snapshot(tok: string) {
  const x = await trading(tok, 'GetItem',
    '<?xml version="1.0" encoding="utf-8"?><GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">' +
    '<ItemID>' + ITEM + '</ItemID><DetailLevel>ReturnAll</DetailLevel></GetItemRequest>');
  const m = new Map<string, { avail: number; price: string }>();
  for (const v of x.matchAll(/<Variation>([\s\S]*?)<\/Variation>/g)) {
    const name = v[1].match(/<Name>Card[^<]*<\/Name><Value>([^<]*)</)?.[1] ?? '';
    const q = Number(v[1].match(/<Quantity>(\d+)</)?.[1] ?? 0);
    const s = Number(v[1].match(/<QuantitySold>(\d+)</)?.[1] ?? 0);
    m.set(name, { avail: q - s, price: v[1].match(/<StartPrice[^>]*>([\d.]+)</)?.[1] ?? '' });
  }
  return {
    title: x.match(/<Title>([^<]*)</)?.[1] ?? '',
    desc: x.match(/<Description>([\s\S]*?)<\/Description>/)?.[1] ?? '',
    vars: m,
  };
}

(async () => {
  if (TITLE.length > 80) throw new Error('title is ' + TITLE.length + ' chars');
  const tok = await userToken();
  const before = await snapshot(tok);
  const md = [...before.vars.keys()].filter((n) => /mini.?dia/i.test(n)).length;
  console.log('was (' + before.title.length + '): ' + before.title);
  console.log('now (' + TITLE.length + '): ' + TITLE);
  console.log('variations ' + before.vars.size + ', of which Mini Diamond: ' + md);
  console.log('old description carries a broken CDATA close: ' + /&#093;&#093;&gt;|&#093;&#093;>/.test(before.desc));
  if (!APPLY) { console.log('\nDRY RUN, pass --apply'); return; }

  const res = await trading(tok, 'ReviseFixedPriceItem',
    '<?xml version="1.0" encoding="utf-8"?><ReviseFixedPriceItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">' +
    '<ErrorLanguage>en_US</ErrorLanguage><WarningLevel>High</WarningLevel><Item><ItemID>' + ITEM + '</ItemID>' +
    '<Title>' + TITLE.replace(/&/g, '&amp;') + '</Title>' +
    '<Description><![CDATA[' + DESC + ']]' + '></Description>' +
    '</Item></ReviseFixedPriceItemRequest>');
  const ack = res.match(/<Ack>(\w+)</)?.[1];
  console.log('\nrevise: ' + ack);
  for (const m2 of res.matchAll(/<LongMessage>([^<]*)</g)) console.log('   ' + m2[1].slice(0, 150));
  if (ack === 'Failure') process.exit(1);

  const after = await snapshot(tok);
  const problems: string[] = [];
  if (after.title !== TITLE) problems.push('title did not take');
  if (!/Not every card in this listing is a Mini Diamond/.test(after.desc)) problems.push('the new description line is missing');
  if (after.vars.size !== before.vars.size) problems.push('variation count ' + before.vars.size + ' -> ' + after.vars.size);
  for (const [n, b] of before.vars) {
    const a = after.vars.get(n);
    if (!a) { problems.push('LOST variation ' + n); continue; }
    if (a.avail !== b.avail) problems.push(n + ' availability ' + b.avail + ' -> ' + a.avail);
    if (a.price !== b.price) problems.push(n + ' price ' + b.price + ' -> ' + a.price);
  }
  problems.forEach((p) => console.log('   PROBLEM ' + p));
  if (problems.length) process.exit(1);
  console.log('verify: title and description updated, all ' + after.vars.size + ' variations untouched');
})();
