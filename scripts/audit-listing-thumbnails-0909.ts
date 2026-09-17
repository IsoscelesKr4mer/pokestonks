/**
 * Why do some Seller Hub thumbnails render as broken alt-text?
 *
 *   npx tsx scripts/audit-listing-thumbnails-0909.ts
 *
 * The big listing photo works everywhere, so the master image is fine. Seller
 * Hub and search results use eBay's generated thumbnail variants (s-l140 and
 * friends). This fetches every active listing's picture, decodes the dimensions
 * eBay baked into the URL, and HEAD-checks the thumbnail variants, so the
 * difference between the working and broken listings is measured rather than
 * guessed at.
 */
import { readFileSync } from 'fs';
import { homedir } from 'os';

function fk(o: any, k: string): string | undefined {
  if (o && typeof o === 'object') for (const kk of Object.keys(o)) {
    if (kk === k && typeof o[kk] === 'string') return o[kk];
    const r = fk(o[kk], k); if (r) return r;
  }
  return undefined;
}

async function main() {
  const cfg = JSON.parse(readFileSync(`${homedir()}/.claude.json`, 'utf8'));
  const tok = (await (await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${fk(cfg, 'EBAY_CLIENT_ID')}:${fk(cfg, 'EBAY_CLIENT_SECRET')}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(fk(cfg, 'EBAY_USER_REFRESH_TOKEN')!) +
      '&scope=' + encodeURIComponent('https://api.ebay.com/oauth/api_scope/sell.inventory'),
  })).json()).access_token;

  const trading = async (call: string, body: string) => (await fetch('https://api.ebay.com/ws/api.dll', {
    method: 'POST',
    headers: {
      'X-EBAY-API-CALL-NAME': call, 'X-EBAY-API-SITEID': '0',
      'X-EBAY-API-COMPATIBILITY-LEVEL': '1193', 'X-EBAY-API-IAF-TOKEN': tok, 'Content-Type': 'text/xml',
    },
    body,
  })).text();

  const list = await trading('GetMyeBaySelling',
    '<?xml version="1.0" encoding="utf-8"?><GetMyeBaySellingRequest xmlns="urn:ebay:apis:eBLBaseComponents">'
    + '<ActiveList><Include>true</Include><Pagination><EntriesPerPage>200</EntriesPerPage><PageNumber>1</PageNumber></Pagination></ActiveList>'
    + '</GetMyeBaySellingRequest>');
  const ids = [...list.matchAll(/<ItemID>(\d+)</g)].map((m) => m[1]);
  console.log(`${ids.length} active listings\n`);

  const rows: any[] = [];
  for (const id of ids) {
    const x = await trading('GetItem',
      `<?xml version="1.0" encoding="utf-8"?><GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents"><ItemID>${id}</ItemID><DetailLevel>ReturnAll</DetailLevel></GetItemRequest>`);
    const title = (x.match(/<Title>([^<]*)</)?.[1] ?? '').slice(0, 46);
    const pic = x.match(/<PictureURL>([^<]*)</)?.[1] ?? '';
    const ext = x.match(/<ExternalPictureURL>([^<]*)</)?.[1] ?? '';
    // eBay encodes the stored master dimensions in the URL as base64 "WxH"
    const seg = pic.match(/\/00\/s\/([A-Za-z0-9+/=]+)\//)?.[1];
    let dims = '';
    try { dims = seg ? Buffer.from(seg, 'base64').toString('utf8') : ''; } catch { dims = '?'; }

    // Seller Hub grid pulls the s-l140 variant off the same image id
    const gid = pic.match(/\/z\/([^/]+)\//)?.[1] ?? '';
    const thumb = gid ? `https://i.ebayimg.com/images/g/${gid}/s-l140.jpg` : '';
    let status = 0, len = 0, ctype = '';
    if (thumb) {
      try {
        const r = await fetch(thumb, { method: 'GET' });
        status = r.status; ctype = r.headers.get('content-type') ?? '';
        len = Number(r.headers.get('content-length') ?? 0);
        if (!len) len = (await r.arrayBuffer()).byteLength;
      } catch { status = -1; }
    }
    // The source image on Supabase. If this 404s or serves a wrong content-type,
    // eBay cannot regenerate a thumbnail from it later.
    let src = 0, srcLen = 0, srcType = '';
    if (ext) {
      try {
        const r = await fetch(ext);
        src = r.status; srcType = r.headers.get('content-type') ?? '';
        srcLen = (await r.arrayBuffer()).byteLength;
      } catch { src = -1; }
    }
    rows.push({ id, title, dims, host: ext.includes('supabase') ? 'supabase' : (ext ? 'other' : 'none'), status, len, ctype, pic, ext, src, srcLen, srcType });
  }

  rows.sort((a, b) => a.src - b.src || a.srcLen - b.srcLen);
  console.log('SOURCE IMAGE ON SUPABASE');
  console.log('src  bytes     content-type          item          title');
  for (const r of rows) {
    const flag = r.src === 200 && r.srcLen > 2000 ? 'OK ' : '>>>';
    console.log(`${flag} ${String(r.src).padStart(3)} ${String(r.srcLen).padStart(9)}  ${String(r.srcType).slice(0, 20).padEnd(21)} ${r.id}  ${r.title}`);
  }
  const badSrc = rows.filter((r) => !(r.src === 200 && r.srcLen > 2000));
  console.log(`
${badSrc.length} of ${rows.length} SOURCE images are missing or broken`);
  for (const r of badSrc) console.log(`   ${r.id}  ${r.ext}`);
}
main().catch((e) => { console.error(String(e).slice(0, 600)); process.exit(1); });
