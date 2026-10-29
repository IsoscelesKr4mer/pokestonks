/**
 * Send Michael's post-purchase thank you to buyers who have paid, once each.
 *
 *   npx tsx scripts/thank-buyers.ts            # dry run, shows every message
 *   npx tsx scripts/thank-buyers.ts --apply
 *   npx tsx scripts/thank-buyers.ts --days 14  # how far back to look
 *
 * Michael, 2026-10-29: "Wow I'm always messageing folks after they make a
 * purchase i could just have you automate that", and, asked for his own
 * wording so this does not start sounding like a bot: *"I always say
 * something like 'hey thanks for the order! I'll make sure to get this out to
 * USPS ASAP so you can get your tracking'"*.
 *
 * THE TEXT IS HIS, VERBATIM IN SUBSTANCE. It is not improved, shortened or
 * made more professional. The whole value of the message is that it reads
 * like the person they bought from, and his buyers have been getting this
 * exact note by hand for months.
 *
 * It promises promptness and tracking, which is a soft claim he already makes
 * and can keep on every order. It deliberately carries NO DATE. "Ships
 * tomorrow" in an automated message becomes a promise on every future order,
 * made by a script, at a time nobody is reading it.
 *
 * ## It must never send twice, and never to a cancelled order
 *
 * A duplicate thank you reads worse than no thank you, and this morning's
 * order 27-15326-47918 is the live example of the other failure: paid at
 * 02:53 and cancelled by the buyer at 03:05. An unguarded loop would have
 * thanked him for a box he no longer wanted.
 *
 * So: only `orderPaymentStatus === 'PAID'` with `cancelState` NONE_REQUESTED,
 * and every send is appended to `data/buyer_messages.json` keyed by order id
 * before the next one goes out. That file is the dedupe record and it is
 * committed, so the history is readable without the API.
 *
 * A FILE RATHER THAN A TABLE on purpose: a new table means a migration, and
 * the standing rule here is that `drizzle-kit push` is never run. A flat log
 * is enough for a list that grows by a handful of rows a week.
 *
 * ## Sending is NOT yet proven
 *
 * Reading the inbox is verified (`GetMyMessages`, 16 messages). Sending has
 * never been exercised from here, because the only way to test it is to send
 * a real person a real message. The first `--apply` run is that test, and it
 * is why the dry run prints the full text of every message first.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname } from 'node:path';

const APPLY = process.argv.includes('--apply');
const daysArg = process.argv.indexOf('--days');
const DAYS = daysArg >= 0 ? Number(process.argv[daysArg + 1]) : 14;
const LOG = 'data/buyer_messages.json';

const SUBJECT = 'Thanks for your order';
const BODY =
  "Hey, thanks for the order! I'll make sure to get this out to USPS ASAP " +
  'so you can get your tracking.';

type Sent = { orderId: string; buyer: string; itemId: string; sentAt: string; body: string };

function loadLog(): Sent[] {
  if (!existsSync(LOG)) return [];
  return JSON.parse(readFileSync(LOG, 'utf8')) as Sent[];
}

function saveLog(rows: Sent[]) {
  mkdirSync(dirname(LOG), { recursive: true });
  writeFileSync(LOG, JSON.stringify(rows, null, 2) + '\n');
}

function fk(o: any, k: string): string | undefined {
  if (o && typeof o === 'object') {
    for (const [kk, v] of Object.entries(o)) {
      if (kk === k && typeof v === 'string') return v;
      const f = fk(v, k);
      if (f) return f;
    }
  }
  return undefined;
}

function cfg() {
  return JSON.parse(readFileSync(homedir() + '/.claude.json', 'utf8'));
}

async function token(scope: string): Promise<string> {
  const c = cfg();
  const r = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: {
      Authorization:
        'Basic ' +
        Buffer.from(fk(c, 'EBAY_CLIENT_ID') + ':' + fk(c, 'EBAY_CLIENT_SECRET')).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: fk(c, 'EBAY_USER_REFRESH_TOKEN')!,
      scope,
    }).toString(),
  });
  const j: any = await r.json();
  if (!j.access_token) throw new Error('token refresh failed: ' + JSON.stringify(j).slice(0, 300));
  return j.access_token as string;
}

function pick(xml: string, tag: string): string | null {
  const open = '<' + tag;
  const close = '</' + tag + '>';
  const i = xml.indexOf(open);
  if (i < 0) return null;
  const gt = xml.indexOf('>', i);
  const j = xml.indexOf(close, gt);
  if (gt < 0 || j < 0) return null;
  return xml.slice(gt + 1, j);
}

/** XML-escape, because a buyer's username is not ours to trust in markup. */
function esc(s: string): string {
  return s
    .split('&').join('&amp;')
    .split('<').join('&lt;')
    .split('>').join('&gt;')
    .split('"').join('&quot;')
    .split("'").join('&apos;');
}

async function sendMessage(tok: string, itemId: string, buyer: string): Promise<string> {
  const xml =
    '<?xml version="1.0" encoding="utf-8"?>' +
    '<AddMemberMessageAAQToPartnerRequest xmlns="urn:ebay:apis:eBLBaseComponents">' +
    `<ItemID>${esc(itemId)}</ItemID>` +
    '<MemberMessage>' +
    `<Subject>${esc(SUBJECT)}</Subject>` +
    `<Body>${esc(BODY)}</Body>` +
    '<QuestionType>General</QuestionType>' +
    `<RecipientID>${esc(buyer)}</RecipientID>` +
    '<EmailCopyToSender>false</EmailCopyToSender>' +
    '</MemberMessage>' +
    '</AddMemberMessageAAQToPartnerRequest>';
  const r = await fetch('https://api.ebay.com/ws/api.dll', {
    method: 'POST',
    headers: {
      'X-EBAY-API-CALL-NAME': 'AddMemberMessageAAQToPartner',
      'X-EBAY-API-SITEID': '0',
      'X-EBAY-API-COMPATIBILITY-LEVEL': '1193',
      'X-EBAY-API-IAF-TOKEN': tok,
      'Content-Type': 'text/xml',
    },
    body: xml,
  });
  return r.text();
}

async function main() {
  const log = loadLog();
  const already = new Set(log.map((r) => r.orderId));

  const ful = await token('https://api.ebay.com/oauth/api_scope/sell.fulfillment');
  const since = new Date(Date.now() - DAYS * 86400_000).toISOString().slice(0, 19) + '.000Z';
  const r = await fetch(
    'https://api.ebay.com/sell/fulfillment/v1/order?limit=100&filter=' +
      encodeURIComponent(`creationdate:[${since}..]`),
    { headers: { Authorization: 'Bearer ' + ful } }
  );
  const body: any = await r.json();
  if (!r.ok) throw new Error('getOrders failed: ' + JSON.stringify(body).slice(0, 300));

  const orders: any[] = body.orders ?? [];
  const todo: { orderId: string; buyer: string; itemId: string; what: string; when: string }[] = [];
  const skipped: string[] = [];

  for (const o of orders) {
    const id = o.orderId as string;
    if (already.has(id)) {
      skipped.push(`${id}  already thanked`);
      continue;
    }
    if (o.cancelStatus?.cancelState !== 'NONE_REQUESTED') {
      skipped.push(`${id}  ${o.cancelStatus?.cancelState}, skipping a cancelled order`);
      continue;
    }
    if (o.orderPaymentStatus !== 'PAID') {
      skipped.push(`${id}  payment ${o.orderPaymentStatus}, not paid yet`);
      continue;
    }
    const buyer = o.buyer?.username as string | undefined;
    const line = (o.lineItems ?? [])[0];
    if (!buyer || !line?.legacyItemId) {
      skipped.push(`${id}  no buyer username or item id on the order`);
      continue;
    }
    todo.push({
      orderId: id,
      buyer,
      itemId: line.legacyItemId,
      what: `${(o.lineItems ?? []).reduce((n: number, l: any) => n + Number(l.quantity), 0)} x ${String(line.title).slice(0, 48)}`,
      when: o.creationDate,
    });
  }

  console.log(`${orders.length} order(s) in the last ${DAYS} days.`);
  for (const s of skipped) console.log(`  skip  ${s}`);
  console.log(`\n${todo.length} buyer(s) to thank:`);
  for (const t of todo) {
    console.log(`\n  to ${t.buyer}   order ${t.orderId}   ${t.when}`);
    console.log(`  re ${t.what}  (item ${t.itemId})`);
    console.log(`  subject: ${SUBJECT}`);
    console.log(`  body:    ${BODY}`);
  }

  if (!todo.length) {
    console.log('\nnothing to send.');
    return;
  }
  if (!APPLY) {
    console.log('\ndry run, nothing sent. Pass --apply once the text is approved.');
    return;
  }

  const tok = await token('https://api.ebay.com/oauth/api_scope/sell.inventory');
  for (const t of todo) {
    const res = await sendMessage(tok, t.itemId, t.buyer);
    const ack = pick(res, 'Ack');
    if (ack === 'Failure') {
      console.log(`\nFAILED to ${t.buyer}: ${pick(res, 'ShortMessage')} :: ${pick(res, 'LongMessage')}`);
      console.log('stopping; nothing further sent and nothing logged for this one.');
      return;
    }
    // Written BEFORE the next send, so a crash mid-run cannot repeat one.
    log.push({
      orderId: t.orderId,
      buyer: t.buyer,
      itemId: t.itemId,
      sentAt: new Date().toISOString(),
      body: BODY,
    });
    saveLog(log);
    console.log(`  sent to ${t.buyer}  (${ack})`);
  }
  console.log(`\n${todo.length} sent, logged in ${LOG}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
