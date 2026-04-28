CREATE TABLE "box_decompositions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"source_purchase_id" bigint NOT NULL,
	"decompose_date" date NOT NULL,
	"source_cost_cents" integer NOT NULL,
	"pack_count" integer NOT NULL,
	"per_pack_cost_cents" integer NOT NULL,
	"rounding_residual_cents" integer NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "box_decompositions_source_cost_nonneg" CHECK ("box_decompositions"."source_cost_cents" >= 0),
	CONSTRAINT "box_decompositions_pack_count_positive" CHECK ("box_decompositions"."pack_count" > 0),
	CONSTRAINT "box_decompositions_per_pack_nonneg" CHECK ("box_decompositions"."per_pack_cost_cents" >= 0)
);
--> statement-breakpoint
ALTER TABLE "purchases" ADD COLUMN "source_decomposition_id" bigint;--> statement-breakpoint
ALTER TABLE "box_decompositions" ADD CONSTRAINT "box_decompositions_source_purchase_id_purchases_id_fk" FOREIGN KEY ("source_purchase_id") REFERENCES "public"."purchases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "box_decompositions_user_date_idx" ON "box_decompositions" USING btree ("user_id","decompose_date");--> statement-breakpoint
CREATE INDEX "box_decompositions_source_purchase_idx" ON "box_decompositions" USING btree ("source_purchase_id");--> statement-breakpoint
CREATE INDEX "purchases_source_decomp_idx" ON "purchases" USING btree ("source_decomposition_id") WHERE "purchases"."source_decomposition_id" IS NOT NULL;