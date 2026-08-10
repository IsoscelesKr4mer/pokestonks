import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const files: [string,string][] = [
  ['C:/Users/Michael/.claude/channels/discord/inbox/1784745305542-1529557384488292404.jpg', 'OhtaniRWB_01_front.jpg'],
  ['C:/Users/Michael/.claude/channels/discord/inbox/1784745305244-1529557384085766164.jpg', 'OhtaniRWB_02_back.jpg'],
  ['C:/Users/Michael/.claude/channels/discord/inbox/1784745305861-1529557385071431771.jpg', 'OhtaniRWB_03_toploader.jpg'],
];
async function main(){
  for (const [src, name] of files){
    const buf = readFileSync(src);
    const { error } = await supabase.storage.from('ebay-listings').upload(name, buf, { contentType:'image/jpeg', upsert:true });
    if (error){ console.error('FAIL', name, error.message); continue; }
    console.log(supabase.storage.from('ebay-listings').getPublicUrl(name).data.publicUrl);
  }
}
main().catch(e=>{console.error(e);process.exit(1);});
