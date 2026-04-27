CREATE TABLE "rips" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"source_purchase_id" bigint NOT NULL,
	"rip_date" date NOT NULL,
	"pack_cost_cents" integer NOT NULL,
	"realized_loss_cents" integer NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rips_pack_cost_nonneg" CHECK ("rips"."pack_cost_cents" >= 0)
);
--> statement-breakpoint
ALTER TABLE "purchases" ADD COLUMN "source_rip_id" bigint;--> statement-breakpoint
ALTER TABLE "rips" ADD CONSTRAINT "rips_source_purchase_id_purchases_id_fk" FOREIGN KEY ("source_purchase_id") REFERENCES "public"."purchases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rips_user_date_idx" ON "rips" USING btree ("user_id","rip_date");--> statement-breakpoint
CREATE INDEX "rips_source_purchase_idx" ON "rips" USING btree ("source_purchase_id");--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_source_rip_id_rips_id_fk" FOREIGN KEY ("source_rip_id") REFERENCES "public"."rips"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "purchases_source_rip_idx" ON "purchases" USING btree ("source_rip_id") WHERE "purchases"."source_rip_id" IS NOT NULL;