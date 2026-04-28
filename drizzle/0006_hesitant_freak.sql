ALTER TABLE "catalog_items" ADD COLUMN "pack_count" integer;--> statement-breakpoint
UPDATE "catalog_items" SET "pack_count" = 36 WHERE "product_type" = 'Booster Box';--> statement-breakpoint
UPDATE "catalog_items" SET "pack_count" = 6  WHERE "product_type" = 'Booster Bundle';--> statement-breakpoint
UPDATE "catalog_items" SET "pack_count" = 9  WHERE "product_type" = 'Elite Trainer Box';--> statement-breakpoint
UPDATE "catalog_items" SET "pack_count" = 4  WHERE "product_type" = 'Build & Battle';--> statement-breakpoint
UPDATE "catalog_items" SET "pack_count" = 6  WHERE "product_type" = 'Premium Collection';--> statement-breakpoint
UPDATE "catalog_items" SET "pack_count" = 6  WHERE "product_type" = 'ex Box';--> statement-breakpoint
UPDATE "catalog_items" SET "pack_count" = 3  WHERE "product_type" = 'Tin';--> statement-breakpoint
UPDATE "catalog_items" SET "pack_count" = 3  WHERE "product_type" = 'Pin Collection';--> statement-breakpoint
UPDATE "catalog_items" SET "pack_count" = 4  WHERE "product_type" = 'Collection Box';--> statement-breakpoint
UPDATE "catalog_items" SET "pack_count" = 4  WHERE "product_type" = 'Collection';--> statement-breakpoint
UPDATE "catalog_items" SET "pack_count" = 3  WHERE "product_type" = 'Blister';--> statement-breakpoint
UPDATE "catalog_items" SET "pack_count" = 1  WHERE "product_type" = 'Booster Pack';