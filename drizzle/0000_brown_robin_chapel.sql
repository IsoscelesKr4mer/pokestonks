CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"display_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catalog_items" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"set_name" text,
	"set_code" text,
	"tcgplayer_product_id" bigint,
	"product_type" text,
	"msrp_cents" integer,
	"pokemon_tcg_card_id" text,
	"tcgplayer_sku_id" bigint,
	"card_number" text,
	"rarity" text,
	"variant" text,
	"image_url" text,
	"image_storage_path" text,
	"release_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "catalog_items_tcgplayer_product_id_unique" UNIQUE("tcgplayer_product_id")
);
--> statement-breakpoint
CREATE TABLE "market_prices" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"catalog_item_id" bigint NOT NULL,
	"snapshot_date" date NOT NULL,
	"condition" text,
	"market_price_cents" integer,
	"low_price_cents" integer,
	"high_price_cents" integer,
	"source" text DEFAULT 'tcgcsv' NOT NULL,
	CONSTRAINT "market_prices_uniq_snapshot" UNIQUE("catalog_item_id","snapshot_date","condition","source")
);
--> statement-breakpoint
CREATE TABLE "purchases" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"catalog_item_id" bigint NOT NULL,
	"purchase_date" date NOT NULL,
	"quantity" integer NOT NULL,
	"cost_cents" integer NOT NULL,
	"condition" text,
	"is_graded" boolean DEFAULT false NOT NULL,
	"grading_company" text,
	"grade" numeric(3, 1),
	"cert_number" text,
	"source" text,
	"location" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "purchases_quantity_positive" CHECK ("purchases"."quantity" > 0),
	CONSTRAINT "purchases_cost_nonneg" CHECK ("purchases"."cost_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "sales" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"purchase_id" bigint NOT NULL,
	"sale_date" date NOT NULL,
	"quantity" integer NOT NULL,
	"sale_price_cents" integer NOT NULL,
	"fees_cents" integer DEFAULT 0 NOT NULL,
	"matched_cost_cents" integer NOT NULL,
	"platform" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sales_quantity_positive" CHECK ("sales"."quantity" > 0),
	CONSTRAINT "sales_fees_nonneg" CHECK ("sales"."fees_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "user_graded_values" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"catalog_item_id" bigint NOT NULL,
	"grading_company" text NOT NULL,
	"grade" numeric(3, 1) NOT NULL,
	"value_cents" integer NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "refresh_runs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"status" text NOT NULL,
	"total_items" integer,
	"succeeded" integer,
	"failed" integer,
	"errors_json" jsonb
);
--> statement-breakpoint
ALTER TABLE "market_prices" ADD CONSTRAINT "market_prices_catalog_item_id_catalog_items_id_fk" FOREIGN KEY ("catalog_item_id") REFERENCES "public"."catalog_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_catalog_item_id_catalog_items_id_fk" FOREIGN KEY ("catalog_item_id") REFERENCES "public"."catalog_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_purchase_id_purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."purchases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_graded_values" ADD CONSTRAINT "user_graded_values_catalog_item_id_catalog_items_id_fk" FOREIGN KEY ("catalog_item_id") REFERENCES "public"."catalog_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "catalog_items_kind_set_code_idx" ON "catalog_items" USING btree ("kind","set_code");--> statement-breakpoint
CREATE INDEX "catalog_items_name_search_idx" ON "catalog_items" USING gin (to_tsvector('english', "name"));--> statement-breakpoint
CREATE INDEX "catalog_items_card_number_idx" ON "catalog_items" USING btree ("card_number") WHERE "catalog_items"."kind" = 'card';--> statement-breakpoint
CREATE INDEX "market_prices_catalog_date_idx" ON "market_prices" USING btree ("catalog_item_id","snapshot_date");--> statement-breakpoint
CREATE INDEX "purchases_user_catalog_idx" ON "purchases" USING btree ("user_id","catalog_item_id");--> statement-breakpoint
CREATE INDEX "sales_user_date_idx" ON "sales" USING btree ("user_id","sale_date");--> statement-breakpoint
CREATE INDEX "user_graded_values_lookup_idx" ON "user_graded_values" USING btree ("user_id","catalog_item_id","grading_company","grade","recorded_at");