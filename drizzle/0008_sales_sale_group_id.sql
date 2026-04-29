ALTER TABLE "sales" ADD COLUMN "sale_group_id" uuid DEFAULT gen_random_uuid() NOT NULL;
--> statement-breakpoint
CREATE INDEX "sales_sale_group_idx" ON "sales" USING btree ("sale_group_id");
--> statement-breakpoint
CREATE INDEX "sales_purchase_idx" ON "sales" USING btree ("purchase_id");
