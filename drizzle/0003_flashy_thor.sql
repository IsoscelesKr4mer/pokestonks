ALTER TABLE "catalog_items" ADD COLUMN "last_market_cents" integer;--> statement-breakpoint
ALTER TABLE "catalog_items" ADD COLUMN "last_market_at" timestamp with time zone;