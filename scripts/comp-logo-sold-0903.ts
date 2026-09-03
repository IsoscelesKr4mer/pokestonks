/**
 * Re-comp the eleven Logofractors that sold in one order, to answer whether
 * they were underpriced.
 *
 * Same corrected filter as the 08-31 run: a plain Logofractor is not comped by
 * its own autograph or a serial-numbered colour, and the title must carry 2026
 * and Chrome.
 */
import { config } from 'dotenv';
import { readFileSync } from 'fs';
import { homedir } from 'os';
config({ path: '.env.local' });
const SOLD: [string,string,number][] = [
  ['139','Coby Mayo',2.99], ['86','Trey Yesavage',5.25], ['294','Luis Morales',1.99],
  ['19','Heriberto Hernandez',1.99], ['154','Manny Machado',3.00], ['115','Owen Caissie',2.99],
  ['65','Trevor Story',2.00], ['84','Maikel Garcia',1.99], ['166','Lourdes Gurriel Jr.',2.00],
  ['212','Sean Murphy',1.99], ['296','Chris Sale',2.99],
];
const GRADED=/psa|bgs|sgc|cgc|\bgem\b|graded|slab/i;
const NOISE=/\blot\b|break|random|reprint|custom|digital|proxy|\bcase\b|you pick|choose|complete set/i;
const AUTO=/\bautos?\b|autograph|signed|on.?card|\bRA-|\bIS-/i;
const SERIAL=/\/\s?\d{1,4}\b|\b\d{1,3}\s?\/\s?\d{1,4}\b/;
const COLOUR=/\b(gold|blue|pink|green|orange|purple|red|black|aqua)\s*-?\s*(logo)?fractor/i;
const INSERT=/wrecking|future star|perspective|big ticket|rivals|1991|static noise|diamond moment/i;
function fk(o:any,k:string):string|undefined{ if(o&&typeof o==='object'){for(const kk of Object.keys(o)){if(kk===k&&typeof o[kk]==='string')return o[kk];const r=fk(o[kk],k);if(r)return r;}} return undefined;}
(async()=>{
  const cfg=JSON.parse(readFileSync(`${homedir()}/.claude.json`,'utf8'));
  const tok=(await(await fetch('https://api.ebay.com/identity/v1/oauth2/token',{method:'POST',
    headers:{Authorization:'Basic '+Buffer.from(`${fk(cfg,'EBAY_CLIENT_ID')}:${fk(cfg,'EBAY_CLIENT_SECRET')}`).toString('base64'),'Content-Type':'application/x-www-form-urlencoded'},
    body:'grant_type=client_credentials&scope='+encodeURIComponent('https://api.ebay.com/oauth/api_scope')})).json()).access_token;
  let paid=0, now=0, flagged:string[]=[];
  console.log('card                      sold at   comp now   asks   verdict');
  for (const [num,player,price] of SOLD) {
    const j:any=await(await fetch(`https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(`2026 Topps Chrome ${player} logofractor`)}&limit=200`,
      {headers:{Authorization:`Bearer ${tok}`,'X-EBAY-C-MARKETPLACE-ID':'EBAY_US'}})).json();
    const surname=player.split(' ').filter(w=>!/^(Jr\.?|II|III)$/i.test(w)).pop()!.replace(/[^A-Za-z]/g,'');
    const hits=((j.itemSummaries||[]) as any[]).map(i=>({p:Number(i.price?.value||0),t:i.title||''}))
      .filter(x=>x.p>0.5&&x.p<4000)
      .filter(x=>new RegExp(surname,'i').test(x.t))
      .filter(x=>/2026/.test(x.t)&&/chrome/i.test(x.t))
      .filter(x=>/logofractor/i.test(x.t))
      .filter(x=>!AUTO.test(x.t)&&!SERIAL.test(x.t)&&!COLOUR.test(x.t)&&!INSERT.test(x.t))
      .filter(x=>!GRADED.test(x.t)&&!NOISE.test(x.t))
      .sort((a,b)=>a.p-b.p);
    const med=hits.length?hits[Math.floor(hits.length/2)].p:null;
    paid+=price; now+=med??price;
    const gap = med!=null ? (med-price)/price : 0;
    const verdict = med==null ? 'no comps' : hits.length<4 ? `thin (${hits.length})`
      : gap>0.35 ? `LOW by ${(gap*100).toFixed(0)}%` : gap<-0.25 ? `over by ${(-gap*100).toFixed(0)}%` : 'fair';
    if (med!=null && hits.length>=4 && gap>0.35) flagged.push(`#${num} ${player}: sold $${price.toFixed(2)}, comps $${med.toFixed(2)}`);
    console.log(`#${num.padEnd(4)} ${player.padEnd(20)} $${price.toFixed(2).padStart(5)}  ${med!=null?'$'+med.toFixed(2).padStart(6):'     -'}   ${String(hits.length).padStart(3)}   ${verdict}`);
    await new Promise(r=>setTimeout(r,110));
  }
  console.log(`\nsold for $${paid.toFixed(2)} against $${now.toFixed(2)} at today's medians`);
  const FEE=0.1325, SHIP=1.29;
  const gross=paid+SHIP, fees=gross*FEE+0.40;
  console.log(`net on the order: $${gross.toFixed(2)} gross - $${fees.toFixed(2)} fees - $${SHIP.toFixed(2)} label = $${(gross-fees-SHIP).toFixed(2)}`);
  if (flagged.length) { console.log('\nunderpriced by more than a third:'); flagged.forEach(f=>console.log('  '+f)); }
  else console.log('\nnothing underpriced by more than a third');
})();
