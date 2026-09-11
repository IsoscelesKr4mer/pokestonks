/**
 * Why does clicking some gallery photos not select the variation?
 *
 *   npx tsx scripts/diag-pyp-variation-photos-0911.ts
 *
 * Read only. Finds every live multi-variation listing, then for each one
 * reports how many pictures each variation actually carries in
 * Variations.Pictures.VariationSpecificPictureSet, and which pictures sit in
 * the top level PictureDetails instead (those belong to no variation, so
 * clicking one cannot move the dropdown).
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
      Authorization: 'Basic ' + Buffer.from(
        findKey(cfg, 'EBAY_CLIENT_ID') + ':' + findKey(cfg, 'EBAY_CLIENT_SECRET')).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=refresh_token&refresh_token=' +
      encodeURIComponent(findKey(cfg, 'EBAY_USER_REFRESH_TOKEN')!) +
      '&scope=' + encodeURIComponent('https://api.ebay.com/oauth/api_scope/sell.inventory'),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error('token refresh failed: ' + JSON.stringify(j));
  return j.access_token as string;
}

async function trading(tok: string, call: string, inner: string) {
  const body = '<?xml version="1.0" encoding="utf-8"?><' + call + 'Request xmlns="urn:ebay:apis:eBLBaseComponents">' +
    inner + '</' + call + 'Request>';
  const r = await fetch('https://api.ebay.com/ws/api.dll', {
    method: 'POST',
    headers: {
      'X-EBAY-API-CALL-NAME': call, 'X-EBAY-API-SITEID': '0',
      'X-EBAY-API-COMPATIBILITY-LEVEL': '1193', 'X-EBAY-API-IAF-TOKEN': tok, 'Content-Type': 'text/xml',
    },
    body,
  });
  return await r.text();
}

(async () => {
  const tok = await userToken();

  // every active listing, paged
  const ids: { id: string; title: string }[] = [];
  for (let page = 1; page <= 10; page++) {
    const x = await trading(tok, 'GetMyeBaySelling',
      '<ActiveList><Include>true</Include><Pagination><EntriesPerPage>200</EntriesPerPage>' +
      '<PageNumber>' + page + '</PageNumber></Pagination></ActiveList>' +
      '<DetailLevel>ReturnAll</DetailLevel>');
    const items = [...x.matchAll(/<Item>([\s\S]*?)<\/Item>/g)].map((m) => m[1]);
    if (!items.length) break;
    for (const it of items) {
      const id = it.match(/<ItemID>(\d+)<\/ItemID>/)?.[1];
      const title = it.match(/<Title>([^<]*)<\/Title>/)?.[1] ?? '';
      if (id) ids.push({ id, title });
    }
    const total = Number(x.match(/<TotalNumberOfPages>(\d+)</)?.[1] ?? 1);
    if (page >= total) break;
  }
  console.log('active listings: ' + ids.length);

  for (const { id, title } of ids) {
    const x = await trading(tok, 'GetItem',
      '<ItemID>' + id + '</ItemID><DetailLevel>ReturnAll</DetailLevel>' +
      '<IncludeItemSpecifics>true</IncludeItemSpecifics>');
    if (!/<Variations>/.test(x)) continue;

    // pictures attached to variations
    const sets = [...x.matchAll(/<VariationSpecificPictureSet>([\s\S]*?)<\/VariationSpecificPictureSet>/g)]
      .map((m) => {
        const val = m[1].match(/<VariationSpecificValue>([^<]*)<\/VariationSpecificValue>/)?.[1] ?? '?';
        const pics = [...m[1].matchAll(/<PictureURL>([^<]*)<\/PictureURL>/g)].map((p) => p[1]);
        return { val, pics };
      });
    const variations = [...x.matchAll(/<Variation>([\s\S]*?)<\/Variation>/g)].map((m) => {
      const name = m[1].match(/<Value>([^<]*)<\/Value>/)?.[1] ?? '?';
      const qty = m[1].match(/<Quantity>(\d+)<\/Quantity>/)?.[1] ?? '?';
      const sold = m[1].match(/<QuantitySold>(\d+)<\/QuantitySold>/)?.[1] ?? '0';
      return { name, qty, sold };
    });
    const gallery = [...(x.match(/<PictureDetails>[\s\S]*?<\/PictureDetails>/)?.[0] ?? '')
      .matchAll(/<PictureURL>([^<]*)<\/PictureURL>/g)].map((m) => m[1]);
    const varPicName = x.match(/<Pictures>\s*<VariationSpecificName>([^<]*)</)?.[1] ?? '?';

    console.log('\n' + '='.repeat(72));
    console.log(id + '  ' + title.slice(0, 68));
    console.log('  variations ' + variations.length + ' | picture sets ' + sets.length +
      ' | top level gallery pics ' + gallery.length + ' | keyed on "' + varPicName + '"');

    const setByVal = new Map(sets.map((s) => [s.val, s.pics]));
    const noSet = variations.filter((v) => !setByVal.has(v.name));
    const oneOnly = sets.filter((s) => s.pics.length < 2);
    const orphanVals = sets.filter((s) => !variations.some((v) => v.name === s.val));

    if (noSet.length) {
      console.log('  NO PICTURE SET AT ALL (' + noSet.length + '):');
      noSet.forEach((v) => console.log('     ' + v.name));
    }
    if (oneOnly.length) {
      console.log('  only ' + '1 picture (' + oneOnly.length + '):');
      oneOnly.forEach((s) => console.log('     ' + s.val + '  [' + s.pics.length + ']'));
    }
    if (orphanVals.length) {
      console.log('  picture set with no matching variation (' + orphanVals.length + '):');
      orphanVals.forEach((s) => console.log('     ' + s.val));
    }
    if (!noSet.length && !oneOnly.length && !orphanVals.length) console.log('  all variations carry 2+ pictures');

    // is the gallery made of pictures that also live in a variation set?
    const inSets = new Set(sets.flatMap((s) => s.pics));
    const galleryOrphans = gallery.filter((g) => !inSets.has(g));
    console.log('  gallery pics not in any variation set: ' + galleryOrphans.length + ' of ' + gallery.length);
  }
})();
