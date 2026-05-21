-- eBay sync feature: per-user credentials, listing → catalog mappings,
-- per-order dedup, and last-synced-at watermark.

CREATE TABLE "ebay_credentials" (
  "user_id" uuid PRIMARY KEY NOT NULL,
  "refresh_token" text NOT NULL,
  "access_token" text,
  "access_token_expires_at" timestamp with time zone,
  "ebay_user_id" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ebay_listing_mappings" (
  "id" bigserial PRIMARY KEY NOT NULL,
  "user_id" uuid NOT NULL,
  "ebay_item_id" text NOT NULL,
  "mappings" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "ebay_listing_mappings_user_item_unique" UNIQUE("user_id","ebay_item_id")
);
--> statement-breakpoint
CREATE INDEX "ebay_listing_mappings_user_item_idx" ON "ebay_listing_mappings" USING btree ("user_id","ebay_item_id");
--> statement-breakpoint
CREATE TABLE "ebay_synced_orders" (
  "id" bigserial PRIMARY KEY NOT NULL,
  "user_id" uuid NOT NULL,
  "ebay_order_id" text NOT NULL,
  "sale_group_id" uuid,
  "skipped" boolean DEFAULT false NOT NULL,
  "synced_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "ebay_synced_orders_user_order_unique" UNIQUE("user_id","ebay_order_id")
);
--> statement-breakpoint
CREATE INDEX "ebay_synced_orders_user_idx" ON "ebay_synced_orders" USING btree ("user_id");
--> statement-breakpoint
CREATE TABLE "ebay_sync_state" (
  "user_id" uuid PRIMARY KEY NOT NULL,
  "last_synced_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- Foreign keys to auth.users (Supabase) with cascade on delete
ALTER TABLE "ebay_credentials" ADD CONSTRAINT "ebay_credentials_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ebay_listing_mappings" ADD CONSTRAINT "ebay_listing_mappings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ebay_synced_orders" ADD CONSTRAINT "ebay_synced_orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ebay_sync_state" ADD CONSTRAINT "ebay_sync_state_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

-- RLS: scope each table to the authenticated user
ALTER TABLE "ebay_credentials" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "own ebay credentials" ON "ebay_credentials" AS PERMISSIVE FOR ALL TO "authenticated" USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
--> statement-breakpoint
ALTER TABLE "ebay_listing_mappings" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "own ebay listing mappings" ON "ebay_listing_mappings" AS PERMISSIVE FOR ALL TO "authenticated" USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
--> statement-breakpoint
ALTER TABLE "ebay_synced_orders" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "own ebay synced orders" ON "ebay_synced_orders" AS PERMISSIVE FOR ALL TO "authenticated" USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
--> statement-breakpoint
ALTER TABLE "ebay_sync_state" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "own ebay sync state" ON "ebay_sync_state" AS PERMISSIVE FOR ALL TO "authenticated" USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
