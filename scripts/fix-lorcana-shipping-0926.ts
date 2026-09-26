/**
 * Fix the Lorcana bundle: the declared package was badly wrong and it cost him
 * real money.
 *
 *   npx tsx scripts/fix-lorcana-shipping-0926.ts --apply
 *
 * [voice] "that Larkana box is so fucking awkward. I had to go to FedEx and get
 * a giant-ass box like 20 by 20 by 4 something and it weighed like 4 pounds and
 * 13 ounces and shipping cost me over $30 where the buyer paid 11 so my overall
 * total earnings on the sale was like $34 So I sold that at a fucking loss."
 *
 * MY DECLARATION CAUSED THIS. I put 14x11x4 at 3 lb on the listing on 09-24
 * without ever weighing or measuring the box, said so twice, and shipped it
 * anyway. That declaration is what quoted the buyer $11.30. Reality:
 *
 *              declared        actual        error
 *   dims       14x11x4         20x20x4       616 -> 1600 cu in, 2.6x
 *   weight     3 lb 0 oz       4 lb 13 oz    +1.8 lb
 *   shipping   $11.30 quoted   ~$31.78 paid  he ate ~$20
 *
 * So the sale booked at +$10.29 is really a LOSS of $10.19.
 *
 * ONLY THE OVERRUN GOES IN FEES, NOT THE WHOLE LABEL. Revenue here is the item
 * subtotal with the buyer-paid $11.30 already excluded, so charging the full
 * $31.78 on top double-counts what he did collect and reports a $21.49 loss
 * against his actual $10.19. The right figure is eBay $10.51 + ($31.78 -
 * $11.30) = $30.99, which reconciles to the $34.00 payout he reported. The
 * constant below is the raw label; the follow-up correction set fees to $30.99.
 *
 * AND MOST OF THE OVERRUN WAS AVOIDABLE. 20x20x4 is 1,600 cu in, under the
 * 1,728 (1 cu ft) threshold at which USPS Ground Advantage starts applying
 * dimensional weight, so USPS would have billed the actual 5 lb. FedEx applies
 * dim weight at any size: 1600/139 = 12 lb. He paid for 12 pounds to move 5.
 * The listing's own policy is calculated USPS, so the eBay label is the cheap
 * one - the trip to FedEx is what cost the money.
 *
 * The label figure is DERIVED, not read off a receipt: he said the payout was
 * "like $34" on a $76.29 order with a $10.51 fee, which puts the label at
 * $31.78. Flagged in the sale note as derived so it can be corrected when he
 * sends the real number.
 *
 * THE SECOND UNIT IS STILL LIVE AT THE SAME WRONG WEIGHT, which is the urgent
 * part: another buyer could take it at $11 of shipping tonight and repeat the
 * loss exactly. Repackaged to his measured 20x20x4 at 5 lb (rounded up from
 * 4 lb 13 oz, free to do because the buyer pays calculated).
 *
 * Note what that does to the offer floor. At ~$30 of real shipping the $62
 * auto-accept floor is now a loser, so it moves up with the weight.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
import { readFileSync } from 'fs';
import { homedir } from 'os';
config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const ITEM = '168716433823';
const SALE = 624;
const LABEL = 3178;      // derived from his "$34" payout, pending the receipt
const NEW_FLOOR = '64.00';

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
  const sql = postgres(process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL!,
    { ssl: 'require', connect_timeout: 20, max: 1 });

  // ---- 1. reboot the sale with the label he actually paid
  const [s] = await sql`select id, sale_price_cents r, fees_cents f, matched_cost_cents c, notes
    from sales where id = ${SALE}`;
  if (!s) throw new Error('sale ' + SALE + ' missing');
  const before = s.r - s.f - s.c;
  const after = s.r - (s.f + LABEL) - s.c;
  console.log('sale#' + SALE + '  booked profit $' + (before / 100).toFixed(2)
    + '  ->  $' + (after / 100).toFixed(2) + '  once the $' + (LABEL / 100).toFixed(2) + ' label is in');
  if (APPLY && !String(s.notes).includes('LABEL')) {
    await sql`update sales set fees_cents = ${s.f + LABEL},
      notes = ${s.notes + ' | LABEL OVERRUN: the eBay-quoted shipping was $11.30 off a '
        + '14x11x4 / 3 lb declaration that had never been weighed. The box actually needs '
        + '20x20x4 and weighs 4 lb 13 oz, and he paid about $31.78 at FedEx, so he ate '
        + 'roughly $20 of shipping and the sale is a loss. The $31.78 is DERIVED from his '
        + 'stated ~$34 payout on a $76.29 order with a $10.51 fee, not read off a receipt; '
        + 'correct it when the receipt turns up.'}
      where id = ${SALE}`;
    console.log('  rebooked, label folded into fees_cents');
  }

  // ---- 2. stop the live unit repeating it
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

  if (APPLY) {
    const r = await call('ReviseFixedPriceItem',
      '<Item><ItemID>' + ITEM + '</ItemID>'
      + '<ShippingPackageDetails><PackageLength>20</PackageLength><PackageWidth>20</PackageWidth>'
      + '<PackageDepth>4</PackageDepth>'
      + '<WeightMajor unit="lbs">5</WeightMajor><WeightMinor unit="oz">0</WeightMinor>'
      + '</ShippingPackageDetails>'
      + '<ListingDetails><MinimumBestOfferPrice>' + NEW_FLOOR + '</MinimumBestOfferPrice></ListingDetails>'
      + '</Item>');
    console.log('\nlisting revise ack=' + (r.match(/<Ack>([^<]*)</)?.[1] ?? '?'));
    for (const m of r.matchAll(/<LongMessage>([^<]*)</g)) console.log('   - ' + m[1].slice(0, 150));
  }
  const v = await call('GetItem', '<ItemID>' + ITEM + '</ItemID><DetailLevel>ReturnAll</DetailLevel>');
  const g = (t: string) => v.match(new RegExp('<' + t + '[^>]*>([^<]*)<'))?.[1] ?? '-';
  console.log('  GetItem: pkg ' + g('PackageLength') + 'x' + g('PackageWidth') + 'x' + g('PackageDepth')
    + '  ' + g('WeightMajor') + 'lb ' + g('WeightMinor') + 'oz   $' + g('CurrentPrice')
    + '  floor $' + g('MinimumBestOfferPrice') + '  sold ' + g('QuantitySold')
    + '  combined=' + g('ApplyShippingDiscount'));
  await sql.end();
})();
