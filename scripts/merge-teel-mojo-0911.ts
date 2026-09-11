/**
 * One Kyle Teel Mojo row at qty 2, and give the Willits Lazer its back.
 *
 *   npx tsx scripts/merge-teel-mojo-0911.ts           # dry run
 *   npx tsx scripts/merge-teel-mojo-0911.ts --apply
 *
 * Michael confirmed qty 2. The Mojo you-pick carried the same card as two
 * dropdown rows at qty 1: "19 - Kyle Teel - Mojo Ref RC" and a second copy
 * that never got its card number filled in, so it read "? - Kyle Teel -
 * Mojo Ref" to a buyer. Merge into the numbered row at qty 2 and delete the
 * mystery one.
 *
 * Same revise attaches the back photo Michael shot on 2026-09-11 to
 * "BCP-95 - Eli Willits - Lazer Ref", which was the only other variation on
 * this listing with a front and no back.
 *
 * Two things make a variation revise dangerous, both handled:
 *   - Quantity on a revise is AVAILABLE, not total. One unit has sold on this
 *     listing, so every survivor is resent at total minus sold. Sending totals
 *     is what refilled seven sold-out cards in September.
 *   - A variation with sales cannot be deleted. Asserted before sending.
 * Prices, labels and picture sets are read off the live listing and resent
 * unchanged, so nothing else can drift.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
import { readFileSync } from 'fs';
import { homedir } from 'os';
import sharp from 'sharp';
config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const ITEM = '168622311437';
const KEEP = '19 - Kyle Teel - Mojo Ref RC';
const DROP = '? - Kyle Teel - Mojo Ref';
const WILLITS = 'BCP-95 - Eli Willits - Lazer Ref';
const WILLITS_BACK = homedir() + '/.claude/channels/discord/inbox/1789161972176-1548082141122928680.jpg';

const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
const esc = (s: string) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const unesc = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'").replace(/&#0?39;/g, "'").replace(/&amp;/g, '&');

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

async function eps(tok: string, jpeg: Buffer, name: string) {
  const B = '----teel' + Date.now();
  const xml = '<?xml version="1.0" encoding="utf-8"?>' +
    '<UploadSiteHostedPicturesRequest xmlns="urn:ebay:apis:eBLBaseComponents">' +
    '<PictureName>' + name + '</PictureName><PictureSet>Supersize</PictureSet>' +
    '</UploadSiteHostedPicturesRequest>';
  const head = Buffer.from(
    '--' + B + '\r\nContent-Disposition: form-data; name="XML Payload"\r\nContent-Type: text/xml;charset=utf-8\r\n\r\n' + xml + '\r\n' +
    '--' + B + '\r\nContent-Disposition: form-data; name="image"; filename="p.jpg"\r\nContent-Type: application/octet-stream\r\nContent-Transfer-Encoding: binary\r\n\r\n', 'utf8');
  const r = await fetch('https://api.ebay.com/ws/api.dll', {
    method: 'POST',
    headers: {
      'X-EBAY-API-CALL-NAME': 'UploadSiteHostedPictures', 'X-EBAY-API-SITEID': '0',
      'X-EBAY-API-COMPATIBILITY-LEVEL': '1193', 'X-EBAY-API-IAF-TOKEN': tok,
      'Content-Type': 'multipart/form-data; boundary=' + B,
    },
    body: Buffer.concat([head, jpeg, Buffer.from('\r\n--' + B + '--\r\n', 'utf8')]),
  });
  return (await r.text()).match(/<FullURL>([^<]*)</)?.[1] ?? null;
}

type V = { sku: string; label: string; price: string; total: number; sold: number; avail: number; pics: string[] };

async function read(tok: string): Promise<V[]> {
  const xml = await trading(tok, 'GetItem',
    '<?xml version="1.0" encoding="utf-8"?><GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">' +
    '<ItemID>' + ITEM + '</ItemID><DetailLevel>ReturnAll</DetailLevel></GetItemRequest>');
  const pics = new Map<string, string[]>();
  for (const m of xml.matchAll(/<VariationSpecificPictureSet>([\s\S]*?)<\/VariationSpecificPictureSet>/g)) {
    pics.set(unesc(m[1].match(/<VariationSpecificValue>([^<]*)</)?.[1] ?? ''),
      [...m[1].matchAll(/<PictureURL>([^<]*)</g)].map((p) => p[1]));
  }
  return [...xml.matchAll(/<Variation>([\s\S]*?)<\/Variation>/g)].map((m) => {
    const label = unesc(m[1].match(/<Name>Card<\/Name><Value>([^<]*)</)?.[1] ?? '');
    const total = Number(m[1].match(/<Quantity>([^<]*)</)?.[1] ?? 0);
    const sold = Number(m[1].match(/<QuantitySold>([^<]*)</)?.[1] ?? 0);
    return {
      sku: m[1].match(/<SKU>([^<]*)</)?.[1] ?? '', label,
      price: m[1].match(/<StartPrice[^>]*>([^<]*)</)?.[1] ?? '0',
      total, sold, avail: total - sold, pics: pics.get(label) ?? [],
    };
  });
}

(async () => {
  const tok = await userToken();
  const vars = await read(tok);

  const keep = vars.find((v) => v.label === KEEP);
  const drop = vars.find((v) => v.label === DROP);
  const willits = vars.find((v) => v.label === WILLITS);
  if (!keep) throw new Error('kept variation not found: ' + KEEP);
  if (!drop) throw new Error('dropped variation not found: ' + DROP);
  if (!willits) throw new Error('willits variation not found: ' + WILLITS);
  if (drop.sold > 0) throw new Error('the duplicate has ' + drop.sold + ' sold, a sold variation cannot be deleted');
  if (willits.pics.length !== 1) throw new Error('expected willits to have exactly 1 picture, has ' + willits.pics.length);

  const mergedQty = keep.avail + drop.avail;
  console.log('listing ' + ITEM + ', ' + vars.length + ' variations, ' +
    vars.reduce((a, v) => a + v.sold, 0) + ' units sold overall');
  console.log('  keep  ' + keep.label + '  avail ' + keep.avail + ' -> ' + mergedQty + '  $' + keep.price);
  console.log('  drop  ' + drop.label + '  avail ' + drop.avail + ', sold ' + drop.sold);
  console.log('  photo ' + willits.label + '  ' + willits.pics.length + ' -> 2 pictures');
  if (!APPLY) { console.log('\nDRY RUN, pass --apply'); await sql.end(); return; }

  const back = await eps(tok, await sharp(readFileSync(WILLITS_BACK)).rotate()
    .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 90 }).toBuffer(),
    'bcp95_willits_lazer_back');
  if (!back) throw new Error('EPS upload of the Willits back failed');

  const survivors = vars.filter((v) => v.label !== DROP);
  const qtyFor = (v: V) => (v.label === KEEP ? mergedQty : v.avail);
  const picsFor = (v: V) => (v.label === WILLITS ? [...v.pics, back] : v.pics);

  const body =
    '<?xml version="1.0" encoding="utf-8"?><ReviseFixedPriceItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">' +
    '<ErrorLanguage>en_US</ErrorLanguage><WarningLevel>High</WarningLevel><Item><ItemID>' + ITEM + '</ItemID><Variations>' +
    '<VariationSpecificsSet><NameValueList><Name>Card</Name>' +
    survivors.map((v) => '<Value>' + esc(v.label) + '</Value>').join('') +
    '</NameValueList></VariationSpecificsSet>' +
    survivors.map((v) =>
      '<Variation><SKU>' + esc(v.sku) + '</SKU><StartPrice>' + v.price + '</StartPrice>' +
      '<Quantity>' + qtyFor(v) + '</Quantity>' +
      '<VariationSpecifics><NameValueList><Name>Card</Name><Value>' + esc(v.label) + '</Value></NameValueList></VariationSpecifics></Variation>').join('') +
    '<Variation><SKU>' + esc(drop.sku) + '</SKU><StartPrice>' + drop.price + '</StartPrice><Quantity>0</Quantity>' +
    '<VariationSpecifics><NameValueList><Name>Card</Name><Value>' + esc(drop.label) + '</Value></NameValueList></VariationSpecifics>' +
    '<Delete>true</Delete></Variation>' +
    '<Pictures><VariationSpecificName>Card</VariationSpecificName>' +
    survivors.filter((v) => picsFor(v).length).map((v) =>
      '<VariationSpecificPictureSet><VariationSpecificValue>' + esc(v.label) + '</VariationSpecificValue>' +
      picsFor(v).map((u) => '<PictureURL>' + esc(u) + '</PictureURL>').join('') + '</VariationSpecificPictureSet>').join('') +
    '</Pictures></Variations></Item></ReviseFixedPriceItemRequest>';

  const res = await trading(tok, 'ReviseFixedPriceItem', body);
  const ack = res.match(/<Ack>(\w+)</)?.[1];
  console.log('\nrevise: ' + ack);
  for (const m of res.matchAll(/<LongMessage>([^<]*)</g)) console.log('   ' + m[1].slice(0, 200));
  if (ack === 'Failure') { await sql.end(); process.exit(1); }

  // every other variation must come back with the availability it had
  const after = await read(tok);
  const problems: string[] = [];
  if (after.some((v) => v.label === DROP)) problems.push('the duplicate row is still there');
  if (after.length !== vars.length - 1) problems.push('expected ' + (vars.length - 1) + ' variations, got ' + after.length);
  const k = after.find((v) => v.label === KEEP);
  if (!k || k.avail !== mergedQty) problems.push('kept row is at ' + k?.avail + ', wanted ' + mergedQty);
  const w = after.find((v) => v.label === WILLITS);
  if (!w || w.pics.length !== 2) problems.push('willits has ' + w?.pics.length + ' pictures, wanted 2');
  for (const b of vars) {
    if (b.label === DROP || b.label === KEEP) continue;
    const a = after.find((v) => v.label === b.label);
    if (!a) { problems.push('lost ' + b.label); continue; }
    if (a.avail !== b.avail) problems.push(b.label + ' availability ' + b.avail + ' -> ' + a.avail);
    if (a.price !== b.price) problems.push(b.label + ' price ' + b.price + ' -> ' + a.price);
  }
  console.log('verify: ' + after.length + ' variations' + (problems.length ? '' : ', every other row unchanged'));
  problems.forEach((p) => console.log('   PROBLEM ' + p));
  if (problems.length) { await sql.end(); process.exit(1); }

  // vault: the Willits Lazer row gains the same back photo
  const [wr] = await sql`select id, photo_urls from baseball_cards
    where player = 'Eli Willits' and card_number = 'BCP-95' and parallel = 'Lazer Refractor'`;
  if (wr) {
    await sql`update baseball_cards
      set photo_urls = (photo_urls || ${JSON.stringify([back])}::jsonb),
          needs_back_photo = false, updated_at = now()
      where id = ${wr.id}`;
    console.log('vault: back photo added to row ' + wr.id);
  } else {
    console.log('vault: no Willits Lazer row found, photo not recorded');
  }
  await sql.end();
})();
