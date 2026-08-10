import { readFileSync } from 'fs';
const a=JSON.parse(readFileSync('scripts/listings_payload.json','utf8'));
for(const sku of ['BBC-65','BBC-130']){
  const o=a.find((x:any)=>x.sku===sku);
  console.log('=====',sku,'=====');
  console.log(JSON.stringify(o));
}
