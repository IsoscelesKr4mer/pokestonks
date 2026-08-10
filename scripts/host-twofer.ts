import { config } from 'dotenv'; import { createClient } from '@supabase/supabase-js'; import { readFileSync } from 'fs';
config({ path: '.env.local' });
const supa=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const B='ebay-listings';
const dir='C:/Users/Michael/.claude/channels/discord/inbox/';
(async()=>{
  const files=[['1785277042141-1531787618528923659.jpg','dr_prismatic_twofer_front.jpg'],['1785277042375-1531787618961068103.jpg','dr_prismatic_twofer_back.jpg']];
  for(const [src,name] of files){
    const {error}=await supa.storage.from(B).upload(name, readFileSync(dir+src), {contentType:'image/jpeg',upsert:true});
    if(error){console.error(name,error.message);process.exit(1);}
    console.log(supa.storage.from(B).getPublicUrl(name).data.publicUrl);
  }
})();
