import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
const H={'User-Agent':'pokestonks/0.1 (+https://github.com/IsoscelesKr4mer/pokestonks)','Accept':'application/json'};
const BUNDLES=[
  {ci:19776,pid:600518,set:'pre',name:'Prismatic Evolutions'},
  {ci:31604,pid:630696,set:'wht',name:'White Flare'},
  {ci:17235,pid:625670,set:'dri',name:'Destined Rivals'},
  {ci:14342,pid:610953,set:'jtg',name:'Journey Together'},
  {ci:53860,pid:692942,set:'me05',name:'Pitch Black'},
];
async function main(){
  const gr=await (await fetch('https://tcgcsv.com/tcgplayer/3/groups',{headers:H})).json();
  const groups=gr.results||gr;
  const gmap=new Map<string,number>();
  for(const g of groups) if(g.abbreviation) gmap.set(String(g.abbreviation).toLowerCase(), g.groupId);
  const today=new Date().toISOString().slice(0,10);
  for(const b of BUNDLES){
    const gid=gmap.get(b.set);
    if(!gid){ console.log(`${b.name}: no group for setcode ${b.set}`); continue; }
    const pj=await (await fetch(`https://tcgcsv.com/tcgplayer/3/${gid}/prices`,{headers:H})).json();
    const rows=(pj.results||pj).filter((x:any)=>x.productId===b.pid && x.marketPrice!=null);
    const mkt=rows.length? Math.max(...rows.map((x:any)=>x.marketPrice)) : null;
    if(mkt==null){ console.log(`${b.name}: no market price (pid ${b.pid}, group ${gid})`); continue; }
    const cents=Math.round(mkt*100);
    const old=(await sql`SELECT last_market_cents FROM catalog_items WHERE id=${b.ci}`)[0]?.last_market_cents;
    await sql`UPDATE catalog_items SET last_market_cents=${cents}, last_market_at=NOW() WHERE id=${b.ci}`;
    await sql`INSERT INTO market_prices (catalog_item_id,snapshot_date,market_price_cents,source) VALUES (${b.ci},${today},${cents},'tcgcsv') ON CONFLICT DO NOTHING`;
    console.log(`${b.name}: $${old?(old/100).toFixed(2):'?'} -> $${(cents/100).toFixed(2)}`);
  }
  await sql.end();
}
main().catch(e=>{console.error(String(e).slice(0,300));process.exit(1);});
