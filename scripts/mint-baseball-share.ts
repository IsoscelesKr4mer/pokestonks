import { config } from 'dotenv';
import postgres from 'postgres';
import { randomBytes } from 'node:crypto';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
const UID='66200525-2237-4cc3-948f-aaafd3253d4b';
async function main(){
  // 1) widen the kind check constraint to allow 'baseball'
  await sql`ALTER TABLE share_tokens DROP CONSTRAINT IF EXISTS share_tokens_kind_check`;
  await sql`ALTER TABLE share_tokens ADD CONSTRAINT share_tokens_kind_check CHECK (kind IN ('storefront','baseball'))`;
  // 2) reuse an existing active baseball token if present, else mint one
  const existing=await sql`SELECT token FROM share_tokens WHERE user_id=${UID} AND kind='baseball' AND revoked_at IS NULL LIMIT 1`;
  let token:string;
  if(existing.length){ token=existing[0].token; console.log('reusing existing token'); }
  else {
    token=randomBytes(12).toString('base64url');
    await sql`INSERT INTO share_tokens (token,user_id,kind,label,header_title)
      VALUES (${token},${UID},'baseball','baseball collection (Discord 2026-07-24)','Baseball Card Collection')`;
    console.log('minted new token');
  }
  console.log('TOKEN='+token);
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
