import { readFileSync } from 'fs';
const a=JSON.parse(readFileSync('scripts/listings_payload.json','utf8'));
const ga=a.find((o:any)=>o.sku==='BBC-130');
const ese=a.find((o:any)=>o.priceCents<300); // a cheap eSE card
console.log('PILOT GA:', ga.sku, ga.product.title, '| policy', ga.offer.fulfillmentPolicyId, '| bestOffer', ga.offer.bestOffer);
console.log('PILOT eSE:', ese.sku, ese.product.title, '| $'+(ese.priceCents/100).toFixed(2), '| policy', ese.offer.fulfillmentPolicyId);
