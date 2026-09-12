/**
 * Take the false 1st Bowman claims out of two more live listings.
 *
 *   npx tsx scripts/fix-first-bowman-claims-0912.ts           # dry run
 *   npx tsx scripts/fix-first-bowman-claims-0912.ts --apply
 *
 * Found while fixing the Arquette. Seven cards from the hobby box carry no
 * 1ST BOWMAN logo, their titles were corrected on 2026-09-11, and the
 * descriptions were not.
 *
 * 1. The you-pick description says "Card codes: BCP is a 1st Bowman prospect".
 *    That is the exact rule Michael corrected: "The Jesus made is not a 1st
 *    bowman you realize that right". The logo decides, not the prefix, and
 *    five BCP cards in this very listing do not have it. The dropdown labels
 *    are already right, only the blurb is wrong, so it now points at the
 *    labels instead of making a blanket claim.
 *
 * 2. The Caleb Bonemer BCP-218 single still says "1st Bowman card." in its
 *    description. It is not one.
 *
 * The you-pick is a Trading API listing, the Bonemer came from the Inventory
 * API, so they need different calls. Neither touches price, quantity or
 * variations: the you-pick revise deliberately sends no Variations node, which
 * is what keeps the quantity-as-available bug out of reach.
 */
import { config } from 'dotenv';
import { readFileSync } from 'fs';
import { homedir } from 'os';
config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const PYP = '168680135269';
const BONEMER = '168680124215';
const BONEMER_SKU = 'BOWCH-BCP218-7';

const PYP_DESC =
  '<p>2026 Bowman Chrome. Pick your card from the dropdown above. Every card pictured is the one you receive, front and back.</p>' +
  '<p>This listing is the base set, the Bowman Chrome prospects and the inserts. The cards that actually carry the 1ST BOWMAN logo are marked in the dropdown. A BCP number on its own does not make a card a 1st Bowman, so I checked the front of every one rather than going off the prefix.</p>' +
  '<p>Card codes: SF is Stars of the Future, IT is It Came to the League, BB is Big Break, SB is MLB Spring Breakout, TT is Travel Tags.</p>' +
  '<p>All cards are from a single hobby box opened on release day, straight from the pack into a penny sleeve. Raw and ungraded, near mint or better.</p>' +
  '<p>Ships in a penny sleeve and toploader protected between rigid cardboard, with tracking. Ships within 1 business day.</p>' +
  '<p>Buying several? Add them all to your cart and they ship together.</p>' +
  '<p>Smoke-free home. Thanks for looking.</p>';

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

async function snapshot(tok: string, id: string) {
  const x = await trading(tok, 'GetItem',
    '<?xml version="1.0" encoding="utf-8"?><GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">' +
    '<ItemID>' + id + '</ItemID><DetailLevel>ReturnAll</DetailLevel></GetItemRequest>');
  return {
    title: x.match(/<Title>([^<]*)</)?.[1] ?? '',
    desc: x.match(/<Description>([\s\S]*?)<\/Description>/)?.[1] ?? '',
    price: x.match(/<StartPrice[^>]*>([\d.]+)</)?.[1] ?? '',
    vars: [...x.matchAll(/<Variation>/g)].length,
    qty: [...x.matchAll(/<Variation>([\s\S]*?)<\/Variation>/g)]
      .map((m) => (m[1].match(/<Name>Card[^<]*<\/Name><Value>([^<]*)</)?.[1] ?? '') + '=' +
        (Number(m[1].match(/<Quantity>(\d+)</)?.[1] ?? 0) - Number(m[1].match(/<QuantitySold>(\d+)</)?.[1] ?? 0))).join(','),
  };
}

(async () => {
  const tok = await userToken();
  const H = {
    Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json', Accept: 'application/json',
    'Accept-Language': 'en-US', 'Content-Language': 'en-US',
  };

  const pypBefore = await snapshot(tok, PYP);
  const bonBefore = await snapshot(tok, BONEMER);
  console.log('you-pick ' + PYP + '  ' + pypBefore.vars + ' variations');
  console.log('   claims "BCP is a 1st Bowman prospect": ' + /BCP is a 1st Bowman/i.test(pypBefore.desc));
  console.log('bonemer  ' + BONEMER + '  $' + bonBefore.price);
  console.log('   claims 1st Bowman: ' + /1st\s*Bowman/i.test(bonBefore.desc));
  if (!APPLY) { console.log('\nDRY RUN, pass --apply'); return; }

  // 1. you-pick, description only, no Variations node
  const r1 = await trading(tok, 'ReviseFixedPriceItem',
    '<?xml version="1.0" encoding="utf-8"?><ReviseFixedPriceItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">' +
    '<ErrorLanguage>en_US</ErrorLanguage><WarningLevel>High</WarningLevel><Item><ItemID>' + PYP + '</ItemID>' +
    '<Description><![CDATA[' + PYP_DESC + ']]></Description></Item></ReviseFixedPriceItemRequest>');
  console.log('\nyou-pick revise: ' + (r1.match(/<Ack>(\w+)</)?.[1]));
  for (const m of r1.matchAll(/<LongMessage>([^<]*)</g)) console.log('   ' + m[1].slice(0, 150));

  // 2. bonemer, inventory offer description only
  const offers: any = await (await fetch('https://api.ebay.com/sell/inventory/v1/offer?sku=' + BONEMER_SKU, { headers: H })).json();
  const offer = offers.offers?.[0];
  if (!offer) throw new Error('no offer for ' + BONEMER_SKU);
  const newDesc = offer.listingDescription
    .replace(/<p>\s*1st Bowman card\.\s*<\/p>/i, '')
    .replace(/1st Bowman card\.\s*/i, '');
  if (/1st\s*Bowman/i.test(newDesc)) throw new Error('did not manage to strip the claim: ' + newDesc.slice(0, 300));
  const body: any = { ...offer, listingDescription: newDesc };
  for (const k of ['offerId', 'sku', 'marketplaceId', 'format', 'listing', 'status']) delete body[k];
  const p = await fetch('https://api.ebay.com/sell/inventory/v1/offer/' + offer.offerId, {
    method: 'PUT', headers: H, body: JSON.stringify(body),
  });
  console.log('bonemer offer PUT: ' + p.status);
  if (p.status >= 400) { console.log(await p.text()); process.exit(1); }

  const pypAfter = await snapshot(tok, PYP);
  const bonAfter = await snapshot(tok, BONEMER);
  const problems: string[] = [];
  if (/BCP is a 1st Bowman/i.test(pypAfter.desc)) problems.push('you-pick still claims BCP means 1st Bowman');
  if (pypAfter.vars !== pypBefore.vars) problems.push('you-pick variation count ' + pypBefore.vars + ' -> ' + pypAfter.vars);
  if (pypAfter.qty !== pypBefore.qty) problems.push('you-pick quantities moved');
  if (pypAfter.title !== pypBefore.title) problems.push('you-pick title changed');
  if (/1st\s*Bowman/i.test(bonAfter.desc)) problems.push('bonemer still claims 1st Bowman');
  if (bonAfter.price !== bonBefore.price) problems.push('bonemer price ' + bonBefore.price + ' -> ' + bonAfter.price);
  problems.forEach((p) => console.log('   PROBLEM ' + p));
  if (problems.length) process.exit(1);
  console.log('\nverify: you-pick ' + pypAfter.vars + ' variations, all quantities and the title unchanged');
  console.log('verify: bonemer $' + bonAfter.price + ', claim gone');
})();
