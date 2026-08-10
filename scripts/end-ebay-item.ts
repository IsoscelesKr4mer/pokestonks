/**
 * End a Trading-API listing. Usage: npx tsx scripts/end-ebay-item.ts <itemId> [reason]
 * Reason defaults to NotAvailable (use Incorrect when relisting a fixed version).
 */
import { config } from 'dotenv';
import { readFileSync } from 'fs';
import { homedir } from 'os';
config({ path: '.env.local' });
const [itemId, reason = 'Incorrect'] = process.argv.slice(2);
function findKey(o:any,k:string):string|undefined{if(o&&typeof o==='object'){for(const kk of Object.keys(o)){if(kk===k&&typeof o[kk]==='string')return o[kk];const r=findKey(o[kk],k);if(r)return r;}}return undefined;}
async function main(){
  if(!itemId) throw new Error('usage: end-ebay-item.ts <itemId> [reason]');
  const cfg=JSON.parse(readFileSync(homedir()+'/.claude.json','utf8'));
  const t=await fetch('https://api.ebay.com/identity/v1/oauth2/token',{method:'POST',headers:{Authorization:'Basic '+Buffer.from(`${findKey(cfg,'EBAY_CLIENT_ID')}:${findKey(cfg,'EBAY_CLIENT_SECRET')}`).toString('base64'),'Content-Type':'application/x-www-form-urlencoded'},body:'grant_type=refresh_token&refresh_token='+encodeURIComponent(findKey(cfg,'EBAY_USER_REFRESH_TOKEN')!)+'&scope='+encodeURIComponent('https://api.ebay.com/oauth/api_scope/sell.inventory')});
  const tok=(await t.json()).access_token;
  const body=`<?xml version="1.0" encoding="utf-8"?><EndFixedPriceItemRequest xmlns="urn:ebay:apis:eBLBaseComponents"><ErrorLanguage>en_US</ErrorLanguage><WarningLevel>High</WarningLevel><ItemID>${itemId}</ItemID><EndingReason>${reason}</EndingReason></EndFixedPriceItemRequest>`;
  const r=await fetch('https://api.ebay.com/ws/api.dll',{method:'POST',headers:{'X-EBAY-API-CALL-NAME':'EndFixedPriceItem','X-EBAY-API-SITEID':'0','X-EBAY-API-COMPATIBILITY-LEVEL':'1193','X-EBAY-API-IAF-TOKEN':tok,'Content-Type':'text/xml'},body});
  const x=await r.text();
  console.log('ack:', x.match(/<Ack>(\w+)<\/Ack>/)?.[1], '| ended', itemId);
  for(const m of x.matchAll(/<(ShortMessage|LongMessage)>([^<]*)<\/\1>/g)) console.log(' ', m[1]+':', m[2]);
}
main().catch(e=>{console.error(String(e).slice(0,500));process.exit(1);});
