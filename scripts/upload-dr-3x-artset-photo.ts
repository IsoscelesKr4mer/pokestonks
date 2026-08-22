import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const BUCKET = 'ebay-listings';
const files: [string,string][] = [
  ['eBay_assets/v2_photos/DestinedRivals_SleevedPack_ArtSet4_3x_01_twelve_packs.jpg',
   'DestinedRivals_SleevedPack_ArtSet4_3x_01_twelve_packs.jpg'],
];
async function main(){
  for (const [src, name] of files){
    const buf = readFileSync(src);
    const { error } = await supabase.storage.from(BUCKET).upload(name, buf, { contentType:'image/jpeg', upsert:true });
    if (error){ console.error('FAIL', name, error.message); continue; }
    console.log(supabase.storage.from(BUCKET).getPublicUrl(name).data.publicUrl);
  }
}
main().catch(e=>{console.error(e);process.exit(1);});
