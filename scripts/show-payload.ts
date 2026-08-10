import { readFileSync } from 'fs';
const a=JSON.parse(readFileSync('scripts/listings_payload.json','utf8'));
console.log('count',a.length);
for(const o of a.slice(0,2)) console.log(JSON.stringify(o,null,1));
console.log('\n--- titles (all) ---');
for(const o of a) console.log(`${o.sku}\t$${(o.priceCents/100).toFixed(2)}\t${o.offer.fulfillmentPolicyId==='272052757012'?'eSE':'GA '}\t${o.product.title}`);
