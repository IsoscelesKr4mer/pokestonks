/**
 * Build the Trading API AddFixedPriceItem payload for the mojo group, including
 * the per-variation picture sets the Inventory API cannot express.
 *
 *   npx tsx scripts/gen-mojo-trading-payload.ts   # writes scripts/_mojo_trading.json
 */
import { readFileSync, writeFileSync } from 'fs';

const plan = JSON.parse(readFileSync('scripts/_mojo_group.json', 'utf8'));
const VARY_BY = 'Card # / Player / Team';

const DESCRIPTION = [
  '<p>2026 Bowman Chrome Mojo Refractors. Pick your card from the dropdown above. Every card listed is the mojo (mosaic) refractor parallel, not the base chrome.</p>',
  '<p>Raw / ungraded, near mint or better. Cards are pulled straight from mega box packs into penny sleeves, and ship in a penny sleeve and toploader protected between rigid cardboard with tracking. Ships within 1 business day.</p>',
  '<p>Buying several? Add them all to your cart and they ship together.</p>',
  '<p>Smoke-free home. Buy with confidence, check my feedback. Thanks for looking.</p>',
].join('');

const SHARED_SPECIFICS: Record<string, string> = {
  Sport: 'Baseball',
  League: 'Major League Baseball (MLB)',
  Type: 'Sports Trading Card',
  Set: '2026 Bowman Chrome',
  Season: '2026',
  Manufacturer: 'Bowman',
  'Parallel/Variety': 'Mojo Refractor',
  Features: 'Refractor',
  Grade: 'Ungraded',
  Graded: 'No',
  Vintage: 'No',
  Autographed: 'No',
};

// headliners lead the shared gallery; every card also carries its own pair
const GALLERY_LEADS = ['1 - Aaron Judge - Yankees', '18 - Roman Anthony - Red Sox (RC)',
  '100 - Mike Trout - Angels', '23 - Ronald Acuna Jr. - Braves',
  '44 - Elly De La Cruz - Reds', '6 - Sal Stewart - Reds (RC)'];

const byLabel = new Map<string, any>(plan.variations.map((v: any) => [v.label, v]));
const gallery = GALLERY_LEADS.map((l) => byLabel.get(l)?.primary.photos[0]).filter(Boolean);

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
      SKU: v.primary.sku,
      StartPrice: (v.price / 100).toFixed(2),
      Quantity: v.qty,
      VariationSpecifics: { NameValueList: [{ Name: VARY_BY, Value: v.label }] },
    })),
    Pictures: {
      VariationSpecificName: VARY_BY,
      VariationSpecificPictureSet: plan.variations.map((v: any) => ({
        VariationSpecificValue: v.label,
        PictureURL: v.primary.photos,
      })),
    },
  },
};

writeFileSync('scripts/_mojo_trading.json', JSON.stringify(item, null, 2));
console.log('variations:', item.Variations.Variation.length);
console.log('picture sets:', item.Variations.Pictures.VariationSpecificPictureSet.length);
console.log('shared gallery:', gallery.length);
console.log('total qty:', item.Variations.Variation.reduce((n: number, v: any) => n + v.Quantity, 0));
console.log('wrote scripts/_mojo_trading.json');
