import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
async function main(){
  const buf = readFileSync('C:/Users/Michael/.claude/channels/discord/inbox/1784745095192-1529556477289693274.jpg');
  const name = 'McGonigle_RayWave_03_toploader.jpg';
  const { error } = await supabase.storage.from('ebay-listings').upload(name, buf, { contentType:'image/jpeg', upsert:true });
  if (error){ console.error('FAIL', error.message); process.exit(1); }
  console.log(supabase.storage.from('ebay-listings').getPublicUrl(name).data.publicUrl);
}
main().catch(e=>{console.error(e);process.exit(1);});
