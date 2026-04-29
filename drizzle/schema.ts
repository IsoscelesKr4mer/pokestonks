import { pgTable, foreignKey, pgPolicy, uuid, text, timestamp, index, uniqueIndex, unique, check, bigserial, bigint, integer, date, numeric, jsonb, type AnyPgColumn, boolean } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"



export const profiles = pgTable("profiles", {
	id: uuid().primaryKey().notNull(),
	displayName: text("display_name"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.id],
			foreignColumns: [users.id],
			name: "profiles_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("own profile", { as: "permissive", for: "all", to: ["authenticated"], using: sql`(id = auth.uid())`, withCheck: sql`(id = auth.uid())`  }),
]);

export const catalogItems = pgTable("catalog_items", {
	id: bigserial({ mode: "bigint" }).primaryKey().notNull(),
	kind: text().notNull(),
	name: text().notNull(),
	setName: text("set_name"),
	setCode: text("set_code"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	tcgplayerProductId: bigint("tcgplayer_product_id", { mode: "number" }),
	productType: text("product_type"),
	msrpCents: integer("msrp_cents"),
	pokemonTcgCardId: text("pokemon_tcg_card_id"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	tcgplayerSkuId: bigint("tcgplayer_sku_id", { mode: "number" }),
	cardNumber: text("card_number"),
	rarity: text(),
	variant: text(),
	imageUrl: text("image_url"),
	imageStoragePath: text("image_storage_path"),
	releaseDate: date("release_date"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	lastMarketCents: integer("last_market_cents"),
	lastMarketAt: timestamp("last_market_at", { withTimezone: true, mode: 'string' }),
	packCount: integer("pack_count"),
}, (table) => [
	index("catalog_items_card_number_idx").using("btree", table.cardNumber.asc().nullsLast().op("text_ops")).where(sql`(kind = 'card'::text)`),
	uniqueIndex("catalog_items_card_unique_idx").using("btree", table.setCode.asc().nullsLast().op("text_ops"), table.cardNumber.asc().nullsLast().op("text_ops"), table.variant.asc().nullsLast().op("text_ops")).where(sql`(kind = 'card'::text)`),
	index("catalog_items_kind_set_code_idx").using("btree", table.kind.asc().nullsLast().op("text_ops"), table.setCode.asc().nullsLast().op("text_ops")),
	index("catalog_items_name_search_idx").using("gin", sql`to_tsvector('english'::regconfig, name)`),
	unique("catalog_items_tcgplayer_product_id_unique").on(table.tcgplayerProductId),
	pgPolicy("catalog_items public read", { as: "permissive", for: "select", to: ["anon", "authenticated"], using: sql`true` }),
	check("catalog_items_kind_check", sql`kind = ANY (ARRAY['sealed'::text, 'card'::text])`),
]);

export const marketPrices = pgTable("market_prices", {
	id: bigserial({ mode: "bigint" }).primaryKey().notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	catalogItemId: bigint("catalog_item_id", { mode: "number" }).notNull(),
	snapshotDate: date("snapshot_date").notNull(),
	condition: text(),
	marketPriceCents: integer("market_price_cents"),
	lowPriceCents: integer("low_price_cents"),
	highPriceCents: integer("high_price_cents"),
	source: text().default('tcgcsv').notNull(),
}, (table) => [
	index("market_prices_catalog_date_idx").using("btree", table.catalogItemId.asc().nullsLast().op("date_ops"), table.snapshotDate.asc().nullsLast().op("int8_ops")),
	foreignKey({
			columns: [table.catalogItemId],
			foreignColumns: [catalogItems.id],
			name: "market_prices_catalog_item_id_catalog_items_id_fk"
		}).onDelete("cascade"),
	unique("market_prices_uniq_snapshot").on(table.catalogItemId, table.snapshotDate, table.condition, table.source),
	pgPolicy("market_prices public read", { as: "permissive", for: "select", to: ["anon", "authenticated"], using: sql`true` }),
]);

export const sales = pgTable("sales", {
	id: bigserial({ mode: "bigint" }).primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	saleGroupId: uuid("sale_group_id").defaultRandom().notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	purchaseId: bigint("purchase_id", { mode: "number" }).notNull(),
	saleDate: date("sale_date").notNull(),
	quantity: integer().notNull(),
	salePriceCents: integer("sale_price_cents").notNull(),
	feesCents: integer("fees_cents").default(0).notNull(),
	matchedCostCents: integer("matched_cost_cents").notNull(),
	platform: text(),
	notes: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("sales_user_date_idx").using("btree", table.userId.asc().nullsLast().op("date_ops"), table.saleDate.asc().nullsLast().op("date_ops")),
	index("sales_sale_group_idx").using("btree", table.saleGroupId.asc().nullsLast().op("uuid_ops")),
	index("sales_purchase_idx").using("btree", table.purchaseId.asc().nullsLast().op("int8_ops")),
	foreignKey({
			columns: [table.purchaseId],
			foreignColumns: [purchases.id],
			name: "sales_purchase_id_purchases_id_fk"
		}),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "sales_user_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("own sales", { as: "permissive", for: "all", to: ["authenticated"], using: sql`(user_id = auth.uid())`, withCheck: sql`(user_id = auth.uid())`  }),
	check("sales_fees_nonneg", sql`fees_cents >= 0`),
	check("sales_quantity_positive", sql`quantity > 0`),
]);

export const userGradedValues = pgTable("user_graded_values", {
	id: bigserial({ mode: "bigint" }).primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	catalogItemId: bigint("catalog_item_id", { mode: "number" }).notNull(),
	gradingCompany: text("grading_company").notNull(),
	grade: numeric({ precision: 3, scale:  1 }).notNull(),
	valueCents: integer("value_cents").notNull(),
	recordedAt: timestamp("recorded_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	notes: text(),
}, (table) => [
	index("user_graded_values_lookup_idx").using("btree", table.userId.asc().nullsLast().op("uuid_ops"), table.catalogItemId.asc().nullsLast().op("timestamptz_ops"), table.gradingCompany.asc().nullsLast().op("timestamptz_ops"), table.grade.asc().nullsLast().op("timestamptz_ops"), table.recordedAt.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.catalogItemId],
			foreignColumns: [catalogItems.id],
			name: "user_graded_values_catalog_item_id_catalog_items_id_fk"
		}),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "user_graded_values_user_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("own graded values", { as: "permissive", for: "all", to: ["authenticated"], using: sql`(user_id = auth.uid())`, withCheck: sql`(user_id = auth.uid())`  }),
]);

export const refreshRuns = pgTable("refresh_runs", {
	id: bigserial({ mode: "bigint" }).primaryKey().notNull(),
	startedAt: timestamp("started_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	finishedAt: timestamp("finished_at", { withTimezone: true, mode: 'string' }),
	status: text().notNull(),
	totalItems: integer("total_items"),
	succeeded: integer(),
	failed: integer(),
	errorsJson: jsonb("errors_json"),
});

export const purchases = pgTable("purchases", {
	id: bigserial({ mode: "bigint" }).primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	catalogItemId: bigint("catalog_item_id", { mode: "number" }).notNull(),
	purchaseDate: date("purchase_date").notNull(),
	quantity: integer().notNull(),
	costCents: integer("cost_cents").notNull(),
	condition: text(),
	isGraded: boolean("is_graded").default(false).notNull(),
	gradingCompany: text("grading_company"),
	grade: numeric({ precision: 3, scale:  1 }),
	certNumber: text("cert_number"),
	source: text(),
	location: text(),
	notes: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	deletedAt: timestamp("deleted_at", { withTimezone: true, mode: 'string' }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	sourceRipId: bigint("source_rip_id", { mode: "number" }),
}, (table) => [
	index("purchases_source_rip_idx").using("btree", table.sourceRipId.asc().nullsLast().op("int8_ops")).where(sql`(source_rip_id IS NOT NULL)`),
	index("purchases_user_catalog_idx").using("btree", table.userId.asc().nullsLast().op("uuid_ops"), table.catalogItemId.asc().nullsLast().op("uuid_ops")),
	index("purchases_user_catalog_open_idx").using("btree", table.userId.asc().nullsLast().op("int8_ops"), table.catalogItemId.asc().nullsLast().op("int8_ops")).where(sql`(deleted_at IS NULL)`),
	foreignKey({
			columns: [table.catalogItemId],
			foreignColumns: [catalogItems.id],
			name: "purchases_catalog_item_id_catalog_items_id_fk"
		}),
	foreignKey({
			columns: [table.sourceRipId],
			foreignColumns: [rips.id],
			name: "purchases_source_rip_id_rips_id_fk"
		}),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "purchases_user_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("own purchases", { as: "permissive", for: "all", to: ["authenticated"], using: sql`(user_id = auth.uid())`, withCheck: sql`(user_id = auth.uid())`  }),
	check("purchases_cost_nonneg", sql`cost_cents >= 0`),
	check("purchases_quantity_positive", sql`quantity > 0`),
]);

export const rips = pgTable("rips", {
	id: bigserial({ mode: "bigint" }).primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	sourcePurchaseId: bigint("source_purchase_id", { mode: "number" }).notNull(),
	ripDate: date("rip_date").notNull(),
	packCostCents: integer("pack_cost_cents").notNull(),
	realizedLossCents: integer("realized_loss_cents").notNull(),
	notes: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("rips_source_purchase_idx").using("btree", table.sourcePurchaseId.asc().nullsLast().op("int8_ops")),
	index("rips_user_date_idx").using("btree", table.userId.asc().nullsLast().op("date_ops"), table.ripDate.asc().nullsLast().op("date_ops")),
	foreignKey({
			columns: [table.sourcePurchaseId],
			foreignColumns: [purchases.id],
			name: "rips_source_purchase_id_purchases_id_fk"
		}),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "rips_user_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("own rips", { as: "permissive", for: "all", to: ["authenticated"], using: sql`(user_id = auth.uid())`, withCheck: sql`(user_id = auth.uid())`  }),
	check("rips_pack_cost_nonneg", sql`pack_cost_cents >= 0`),
]);
