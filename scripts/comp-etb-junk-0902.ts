/**
 * Comp the ETB leftovers: a holographic Dragonite coin and a sealed basic
 * energy pack.
 *
 * The coin is Dragonite, read off the art: rounded snout, antennae, small
 * wings, segmented belly. The energy pack reads MEE EN 002, so it is Mega
 * Evolution. Those two do not come from the same box -- Mega Evolution's only
 * ETB variants are Mega Gardevoir and Mega Lucario -- so the SET of the coin is
 * unestablished and is deliberately left out of the title rather than guessed.
 */
import { config } from 'dotenv';
import { readFileSync } from 'fs';
import { homedir } from 'os';
config({ path: '.env.local' });
function fk(o:any,k:string):string|undefined{ if(o&&typeof o==='object'){for(const kk of Object.keys(o)){if(kk===k&&typeof o[kk]==='string')return o[kk];const r=fk(o[kk],k);if(r)return r;}} return undefined;}
const GRADED=/psa|bgs|cgc|graded|slab/i;
const NOISE=/proxy|custom|replica|fake|metal card|orica/i;
(async()=>{
  const cfg=JSON.parse(readFileSync(`${homedir()}/.claude.json`,'utf8'));
  const tok=(await(await fetch('https://api.ebay.com/identity/v1/oauth2/token',{method:'POST',
    headers:{Authorization:'Basic '+Buffer.from(`${fk(cfg,'EBAY_CLIENT_ID')}:${fk(cfg,'EBAY_CLIENT_SECRET')}`).toString('base64'),'Content-Type':'application/x-www-form-urlencoded'},
    body:'grant_type=client_credentials&scope='+encodeURIComponent('https://api.ebay.com/oauth/api_scope')})).json()).access_token;
  const search=async(q:string)=>{
    const j:any=await(await fetch(`https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(q)}&limit=200`,
      {headers:{Authorization:`Bearer ${tok}`,'X-EBAY-C-MARKETPLACE-ID':'EBAY_US'}})).json();
    return ((j.itemSummaries||[]) as any[]).map(i=>({p:Number(i.price?.value||0),t:i.title||''}));
  };
  const runs: [string,string,RegExp,RegExp][] = [
    ['Dragonite ETB coin', 'Pokemon Dragonite coin elite trainer box', /dragonite/i, /\blot\b|\bset of\b|pin|card\b|booster|\betb\b(?!.*coin)/i],
    ['sealed ETB energy pack', 'Pokemon elite trainer box sealed energy cards pack', /energ/i, /\blot\b|booster pack|deck|\bbox\b|sleeve/i],
    ['coin + energy lot', 'Pokemon elite trainer box coin energy lot', /coin/i, /booster|\bbox\b(?!.*coin)/i],
  ];
  for (const [label,q,must,bad] of runs) {
    const hits=(await search(q))
      .filter(x=>x.p>0.5&&x.p<80)
      .filter(x=>must.test(x.t))
      .filter(x=>!bad.test(x.t)&&!GRADED.test(x.t)&&!NOISE.test(x.t))
      .sort((a,b)=>a.p-b.p);
    const med=hits.length?hits[Math.floor(hits.length/2)]:null;
    console.log(`\n${label}: ${hits.length} asks${hits.length<4?'  THIN':''}`);
    if (med) console.log(`  low $${hits[0].p.toFixed(2)}  median $${med.p.toFixed(2)}  high $${hits[hits.length-1].p.toFixed(2)}`);
    hits.slice(0,6).forEach(h=>console.log(`    $${h.p.toFixed(2).padStart(6)}  ${h.t.slice(0,68)}`));
    await new Promise(r=>setTimeout(r,120));
  }
})();
