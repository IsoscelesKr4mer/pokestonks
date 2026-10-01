/**
 * Pull both auctions forward so they are live on release day.
 *
 *   npx tsx scripts/start-auctions-now-0930.ts --apply
 *
 * "why tf did you start this on thursday and not wednesday? ... i figured it
 * started tonight at 6"
 *
 * WHY THURSDAY: a Sunday 18:00 PT close is only reachable from a Thursday 18:00
 * PT start, because eBay durations are fixed and 3 days is the only one that
 * lands there. That is true but it is not the point. He had already told me the
 * goal was release-day visibility - "I want these to start now so they end
 * before other 7 day auctions from release day" - and I kept optimising for the
 * Sunday close he named first. Wednesday 18:00 + Days_5 closing Monday was the
 * option that served the stated goal, and I never put it in front of him.
 *
 * `ScheduleTime` IS REVISABLE ON A SCHEDULED LISTING, no relist and no new item
 * id - confirmed here, the start and end both moved. Worth knowing: the last
 * two timing changes were done by ending and recreating, which was unnecessary
 * and is what lost the live-only edits the first time.
 *
 * Both now run 3 days from tonight, closing Sat 2026-10-03 around 7:20pm PT.
 * Still clear of the 10-08 release-day wave.
 */
import { config } from 'dotenv';
import { readFileSync } from 'fs';
import { homedir } from 'os';
config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const ITEMS = ['168743427148', '168743427177'];

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
  const call = async (n: string, b: string) => (await fetch('https://api.ebay.com/ws/api.dll', {
    method: 'POST',
    headers: {
      'X-EBAY-API-CALL-NAME': n, 'X-EBAY-API-SITEID': '0', 'X-EBAY-API-COMPATIBILITY-LEVEL': '1193',
      'X-EBAY-API-IAF-TOKEN': j.access_token, 'Content-Type': 'text/xml',
    },
    body: '<?xml version="1.0" encoding="utf-8"?><' + n + 'Request xmlns="urn:ebay:apis:eBLBaseComponents">'
      + '<ErrorLanguage>en_US</ErrorLanguage><WarningLevel>High</WarningLevel>' + b + '</' + n + 'Request>',
  })).text();

  for (const id of ITEMS) {
    const g = await call('GetItem', '<ItemID>' + id + '</ItemID><DetailLevel>ReturnAll</DetailLevel>');
    const gg = (t: string, s = g) => s.match(new RegExp('<' + t + '[^>]*>([^<]*)<'))?.[1] ?? '-';
    const start = gg('StartTime');
    const live = new Date(start).getTime() <= Date.now();
    console.log('\n' + id + '  ' + gg('Title').slice(0, 52));
    console.log('   ' + (live ? 'LIVE' : 'scheduled') + '  start ' + start.slice(0, 16)
      + '  end ' + gg('EndTime').slice(0, 16) + '  bids ' + gg('BidCount'));
    if (live) { console.log('   already running, leaving alone'); continue; }
    if (!APPLY) { console.log('   would pull start forward'); continue; }
    const t = new Date(Date.now() + 60000).toISOString().replace(/\.\d+Z$/, '.000Z');
    const r = await call('ReviseItem', '<Item><ItemID>' + id + '</ItemID><ScheduleTime>' + t + '</ScheduleTime></Item>');
    console.log('   ack=' + (r.match(/<Ack>([^<]*)</)?.[1] ?? '?'));
    const g2 = await call('GetItem', '<ItemID>' + id + '</ItemID><DetailLevel>ReturnAll</DetailLevel>');
    console.log('   now start ' + gg('StartTime', g2).slice(0, 16) + '  end ' + gg('EndTime', g2).slice(0, 16));
  }
})();
