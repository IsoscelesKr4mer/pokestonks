DROP INDEX IF EXISTS "catalog_items_card_unique_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_items_card_unique_idx" ON "catalog_items" USING btree ("set_code","card_number","variant") NULLS NOT DISTINCT WHERE "catalog_items"."kind" = 'card';
