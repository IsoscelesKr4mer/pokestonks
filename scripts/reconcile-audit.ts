import { config } from 'dotenv';
import postgres from 'postgres';
import { readFileSync } from 'fs';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });

// re-audit: IMG file -> true printed player
const A: Record<string,string> = {
 '0095':'Shohei Ohtani','0096':'Shohei Ohtani','0097':'Garrett Crochet','0098':'Garrett Crochet','0099':'Bryan Woo','0100':'Bryan Woo','0101':'Wyatt Sanford','0102':'Wyatt Sanford','0103':'Eric Hartman','0104':'Eric Hartman','0105':'Kazuma Okamoto','0106':'Kazuma Okamoto','0107':'Munetaka Murakami','0108':'Munetaka Murakami','0109':'Munetaka Murakami','0110':'Munetaka Murakami','0111':'Munetaka Murakami','0112':'Munetaka Murakami','0113':'Shohei Ohtani','0114':'Shohei Ohtani','0115':'Bobby Witt Jr.','0116':'Bobby Witt Jr.','0117':'Justin Crawford','0118':'Dylan Beavers','0119':'Dylan Beavers','0120':'Colson Montgomery','0121':'Colson Montgomery','0122':'Pete Crow-Armstrong','0123':'Pete Crow-Armstrong','0124':'Chase Burns','0125':'Chase Burns','0126':'Konnor Griffin','0127':'Konnor Griffin','0128':'Bo Bichette','0129':'Bo Bichette','0130':'Kyle Karros','0131':'Kyle Karros','0138':'Emerson Hancock','0139':'Bryce Miller','0140':'Cole Young','0141':'Jonny Farmelo','0142':'Colt Emerson','0143':'Colt Emerson','0144':'Colt Emerson','0145':'Felnin Celesten','0146':'Felnin Celesten','0147':'Felnin Celesten','0148':'Lazaro Montes','0149':'Josh Caron','0150':'Ryan Sloan','0151':'Kade Anderson','0152':'Yorger Bautista','0153':'Yorger Bautista','0154':'Yorger Bautista','0155':'POKEMON-Aurorus','0156':'Michael Arroyo','0157':'Felnin Celesten','0158':'Colt Emerson','0159':'Jonny Farmelo','0160':'Kade Anderson','0161':'Colt Emerson','0162':'Felnin Celesten','0163':'George Kirby','0164':'George Kirby','0165':'George Kirby','0166':'Yorger Bautista','0335':'Josh Caron','0336':'Jonny Farmelo','0337':'Korbyn Dickerson','0338':'Ricardo Cova','0339':'Ricardo Cova','0359':'Kendry Martinez','0360':'Julio Rodriguez','0361':'George Kirby','0362':'Mason Peters','0363':'Nick Becker','0364':'Griffin Hugus','0365':'Jonny Farmelo','0366':'Colt Emerson','0367':'Felnin Celesten','0368':'Lazaro Montes','0369':'Kendry Martinez','0370':'Logan Gilbert','0371':'Logan Gilbert','0398':'Shohei Ohtani','0399':'Aaron Judge','0400':'Aaron Judge','0401':'Jackson Chourio','0402':'Mike Trout','0403':'Mike Trout','0404':'Julio Rodriguez','0405':'Vinnie Pasquantino','0406':'Zack Wheeler','0407':'Kevin McGonigle','0408':'Roman Anthony','0409':'Chase Burns','0410':'Kevin McGonigle','0412':'Shohei Ohtani'
};
const seed = JSON.parse(readFileSync('data/baseball_cards_seed.json','utf8')) as any[];
function imgKey(f:string){ const m=f.match(/IMG_(\d+)/); return m?m[1]:null; }

async function main(){
  const rows = await sql<{id:number,player:string,photo_urls:string[]}[]>`SELECT id, player, photo_urls FROM baseball_cards ORDER BY id`;
  const problems:string[]=[];
  for(const r of rows){
    const url0 = (r.photo_urls||[])[0] || '';
    const m = url0.match(/bbcard_(\d+)_/);
    if(!m){ /* manually re-hosted row (already fixed) */ continue; }
    const idx = Number(m[1]);
    const files = seed[idx]?.files || [];
    const leadPlayers = files.map((f:string)=>A[imgKey(f)||''] || '??');
    const trueLeadPlayer = leadPlayers[0];
    const distinct = [...new Set(leadPlayers)];
    if(trueLeadPlayer && trueLeadPlayer !== r.player){
      problems.push(`id ${r.id}: DB="${r.player}" but lead photo (${files[0]}) is "${trueLeadPlayer}"`);
    }
    if(distinct.length>1){
      problems.push(`id ${r.id} ("${r.player}"): photos span MULTIPLE players ${JSON.stringify(files)} -> ${JSON.stringify(leadPlayers)} (grouping error)`);
    }
  }
  console.log(problems.length?problems.join('\n'):'NO lead-photo mismatches among bbcard-indexed rows.');
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
