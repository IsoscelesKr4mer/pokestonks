import { readFileSync, writeFileSync } from 'fs';
const all = JSON.parse(readFileSync('scripts/listings_payload.json','utf8'));
const start = Number(process.argv[2]||0), count = Number(process.argv[3]||20);
const batch = all.slice(start, start+count);
const inv = batch.map((o:any)=>({
  sku:o.sku, condition:'USED_VERY_GOOD',
  conditionDescriptors:[{name:'40001',values:['400010']}],
  packageWeightAndSize:{dimensions:{width:4,length:6,height:1,unit:'INCH'},weight:{value:2,unit:'OUNCE'},shippingIrregular:false},
  availability:{shipToLocationAvailability:{quantity:1}},
  product:o.product,
}));
const off = batch.map((o:any)=>{
  const lp:any={paymentPolicyId:'269110704012',returnPolicyId:'269110705012',fulfillmentPolicyId:o.offer.fulfillmentPolicyId,eBayPlusIfEligible:false};
  if(o.offer.bestOffer){ const floor=(o.priceCents*0.75/100).toFixed(2); lp.bestOfferTerms={bestOfferEnabled:true,autoDeclinePrice:{value:floor,currency:'USD'}}; }
  return {sku:o.sku,marketplaceId:'EBAY_US',format:'FIXED_PRICE',availableQuantity:1,categoryId:'261328',merchantLocationKey:'edmonds-wa',listingDescription:o.product.description,listingPolicies:lp,pricingSummary:{price:{value:o.offer.price,currency:'USD'}},tax:{applyTax:false}};
});
writeFileSync('scripts/_inv.json', JSON.stringify({requests:inv}));
writeFileSync('scripts/_off.json', JSON.stringify({requests:off}));
console.log(`batch ${start}..${start+batch.length-1} of ${all.length} | ${batch.length} skus: ${batch.map((b:any)=>b.sku).join(',')}`);
