import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
const ddl = `
CREATE TABLE IF NOT EXISTS "baseball_cards" (
  "id" bigserial PRIMARY KEY NOT NULL,
  "user_id" uuid NOT NULL,
  "player" text NOT NULL,
  "set_name" text,
  "year" integer,
  "card_number" text,
  "parallel" text,
  "sport" text DEFAULT 'Baseball' NOT NULL,
  "status" text DEFAULT 'needs_photos' NOT NULL,
  "for_sale" boolean DEFAULT true NOT NULL,
  "asking_price_cents" integer,
  "comp_note" text,
  "photo_urls" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "image_storage_path" text,
  "ebay_item_id" text,
  "ebay_offer_id" text,
  "ebay_sku" text,
  "sold_price_cents" integer,
  "sold_date" date,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "baseball_cards_status_valid" CHECK ("baseball_cards"."status" IN ('needs_photos','photographed','priced','listed','sold')),
  CONSTRAINT "baseball_cards_asking_price_nonneg" CHECK ("baseball_cards"."asking_price_cents" IS NULL OR "baseball_cards"."asking_price_cents" >= 0),
  CONSTRAINT "baseball_cards_sold_price_nonneg" CHECK ("baseball_cards"."sold_price_cents" IS NULL OR "baseball_cards"."sold_price_cents" >= 0)
);
CREATE INDEX IF NOT EXISTS "baseball_cards_user_idx" ON "baseball_cards" USING btree ("user_id");
CREATE INDEX IF NOT EXISTS "baseball_cards_status_idx" ON "baseball_cards" USING btree ("status");
ALTER TABLE "baseball_cards" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own baseball_cards" ON "baseball_cards";
CREATE POLICY "own baseball_cards" ON "baseball_cards" AS PERMISSIVE FOR ALL TO "authenticated" USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));
`;
async function main(){
  await sql.unsafe(ddl);
  const cols = await sql`SELECT column_name FROM information_schema.columns WHERE table_name='baseball_cards' ORDER BY ordinal_position`;
  const pol = await sql`SELECT policyname FROM pg_policies WHERE tablename='baseball_cards'`;
  const rls = await sql`SELECT relrowsecurity FROM pg_class WHERE relname='baseball_cards'`;
  console.log('baseball_cards columns:', cols.length);
  console.log('RLS enabled:', rls[0]?.relrowsecurity);
  console.log('policies:', pol.map(p=>p.policyname).join(', '));
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
