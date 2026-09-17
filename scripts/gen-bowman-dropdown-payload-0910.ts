/**
 * Build the AddFixedPriceItem payload for the 45-card 2026 Bowman Chrome
 * you-pick. Writes scripts/_bow_trading.json and SENDS NOTHING.
 *
 *   npx tsx scripts/gen-bowman-dropdown-payload-0910.ts
 *
 * Trading API, not Inventory API: the Inventory API has no per-variation
 * picture field, so every dropdown selection would show the same shared
 * gallery. For a you-pick the photo has to follow the dropdown, which only
 * AddFixedPriceItem can express. Same route as the mojo group.
 *
 * Two rules from memory that this payload has to respect:
 *   - a VariationSpecificValue must round-trip byte for byte, so the labels
 *     written here are the labels that must be used forever after
 *   - Quantity on a later REVISE means AVAILABLE, not total, so never resend
 *     Variation nodes when only the pictures change
 */
import { readFileSync, writeFileSync } from 'fs';

const plan = JSON.parse(readFileSync('scripts/_bow_dropdown.json', 'utf8'));
const VARY_BY: string = plan.varyBy;

const DESCRIPTION = [
  '<p>2026 Bowman Chrome. Pick your card from the dropdown above. Every card pictured is the one you receive, front and back.</p>',
  '<p>This listing is the base set, the Bowman Chrome Prospects 1st Bowman cards, and the inserts. Card codes: BCP is a 1st Bowman prospect, SF is Stars of the Future, IT is It Came to the League, BB is Big Break, SB is MLB Spring Breakout, TT is Travel Tags.</p>',
  '<p>All cards are from a single hobby box opened on release day, straight from the pack into a penny sleeve. Raw and ungraded, near mint or better.</p>',
  '<p>Ships in a penny sleeve and toploader protected between rigid cardboard, with tracking. Ships within 1 business day.</p>',
  '<p>Buying several? Add them all to your cart and they ship together.</p>',
  '<p>Smoke-free home. Thanks for looking.</p>',
].join('');

const SHARED_SPECIFICS: Record<string, string> = {
  Sport: 'Baseball',
  League: 'Major League Baseball (MLB)',
  Type: 'Sports Trading Card',
  Set: '2026 Bowman Chrome',
  Season: '2026',
  Manufacturer: 'Bowman',
  'Parallel/Variety': 'Base',
  Grade: 'Ungraded',
  Graded: 'No',
  Vintage: 'No',
  Autographed: 'No',
};

/** Names a browsing buyer recognises, so the gallery does the selling. */
const GALLERY_LEADS = [
  '100 - Shohei Ohtani - Dodgers',
  '66 - Aaron Judge - Yankees',
  '48 - Sal Stewart - Reds (RC)',
  '76 - Munetaka Murakami - White Sox (RC)',
  '17 - Francisco Lindor - Mets',
  '35 - Julio Rodriguez - Mariners',
];

const byLabel = new Map<string, any>(plan.variations.map((v: any) => [v.label, v]));
const missingLead = GALLERY_LEADS.filter((l) => !byLabel.has(l));
if (missingLead.length) {
  console.log('gallery leads not found in the plan, fix these labels:');
  missingLead.forEach((l) => console.log('   ' + l));
  process.exit(1);
}
const gallery = GALLERY_LEADS.map((l) => byLabel.get(l).photos[0]);

const item = {
  Title: plan.title,
  Description: DESCRIPTION,
  PrimaryCategory: { CategoryID: '261328' },
  ConditionID: 4000,
  ConditionDescriptors: { ConditionDescriptor: { Name: '40001', Value: '400010' } },
  Country: 'US',
  Currency: 'USD',
  Location: 'Edmonds, Washington',
  PostalCode: '98026',
  DispatchTimeMax: 2,
  ListingDuration: 'GTC',
  ListingType: 'FixedPriceItem',
  SellerProfiles: {
    SellerShippingProfile: { ShippingProfileID: '272052757012' },
    SellerReturnProfile: { ReturnProfileID: '269110705012' },
    SellerPaymentProfile: { PaymentProfileID: '269110704012' },
  },
  ItemSpecifics: {
    NameValueList: Object.entries(SHARED_SPECIFICS).map(([Name, Value]) => ({ Name, Value })),
  },
  PictureDetails: { GalleryType: 'Gallery', PictureURL: gallery },
  Variations: {
    VariationSpecificsSet: {
      NameValueList: [{ Name: VARY_BY, Value: plan.variations.map((v: any) => v.label) }],
    },
    Variation: plan.variations.map((v: any) => ({
      SKU: v.sku,
      StartPrice: (v.priceCents / 100).toFixed(2),
      Quantity: v.qty,
      VariationSpecifics: { NameValueList: [{ Name: VARY_BY, Value: v.label }] },
    })),
    Pictures: {
      VariationSpecificName: VARY_BY,
      VariationSpecificPictureSet: plan.variations.map((v: any) => ({
        VariationSpecificValue: v.label,
        PictureURL: v.photos,
      })),
    },
  },
};

writeFileSync('scripts/_bow_trading.json', JSON.stringify(item, null, 2));

const total = plan.variations.reduce((s: number, v: any) => s + v.priceCents, 0);
const badLen = plan.variations.filter((v: any) => v.label.length > 50);
const badPics = plan.variations.filter((v: any) => v.photos.length !== 2);
console.log('title (' + item.Title.length + 'ch): ' + item.Title);
console.log('variations: ' + item.Variations.Variation.length);
console.log('picture sets: ' + item.Variations.Pictures.VariationSpecificPictureSet.length);
console.log('shared gallery: ' + gallery.length);
console.log('total qty: ' + item.Variations.Variation.reduce((n: number, v: any) => n + v.Quantity, 0));
console.log('list value: $' + (total / 100).toFixed(2));
console.log('labels over 50 chars: ' + badLen.length + ' | variations missing a photo pair: ' + badPics.length);
console.log('\nwrote scripts/_bow_trading.json. Nothing sent.');
