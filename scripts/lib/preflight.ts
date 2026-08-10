/**
 * Pre-publish checks for eBay listings.
 *
 * Exists because the 2025-26 Chrome Update NBA listings went live on release
 * day with NO UPC. eBay could not match them to its catalog product, they drew
 * zero views for hours, and nothing in the flow caught it. Every publish path
 * should call this first and refuse to go live on a hard failure.
 */
export type PreflightInput = {
  sku: string;
  title: string;
  priceCents: number;
  costCentsPerUnit?: number;
  unitsPerListing?: number;
  upc?: string | string[] | null;
  imageUrls: string[];
  /** Set false only for genuinely barcode-less items (custom lots, singles). */
  expectUpc?: boolean;
};

export type PreflightResult = { ok: boolean; errors: string[]; warnings: string[] };

const EBAY_TITLE_MAX = 80;
// eBay charges 13.25% of the FULL order total (item + shipping + sales tax)
// plus $0.40, NOT 13.6% of the item subtotal plus $0.30. Verified against
// order 12-14997-48170: $138.45 total x 0.1325 + 0.40 = $18.74 exactly, and
// his synced sale history shows fees averaging 15.24% of the item subtotal.
// Since shipping and the buyer's tax rate are unknown at listing time, model
// the effective bite on the item price directly.
const EFFECTIVE_FEE_RATE_ON_ITEM = 0.153;

export async function preflight(input: PreflightInput): Promise<PreflightResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (input.title.length > EBAY_TITLE_MAX) {
    errors.push(`title is ${input.title.length} chars, eBay allows ${EBAY_TITLE_MAX}`);
  }

  const upcs = input.upc == null ? [] : Array.isArray(input.upc) ? input.upc : [input.upc];
  const expectUpc = input.expectUpc ?? true;
  if (expectUpc && upcs.filter(Boolean).length === 0) {
    errors.push('no UPC. Retail sealed product has one on the box; without it eBay cannot match the catalog product and placement suffers');
  }
  for (const u of upcs.filter(Boolean)) {
    if (!/^\d{12,13}$/.test(u)) errors.push(`UPC "${u}" is not 12-13 digits`);
  }

  if (input.imageUrls.length === 0) errors.push('no images');
  if (input.imageUrls.length === 1) warnings.push('only one image; a back shot materially helps sealed product');
  for (const url of input.imageUrls) {
    try {
      const r = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(15_000) });
      if (!r.ok) errors.push(`image not reachable (${r.status}): ${url.split('/').pop()}`);
    } catch {
      errors.push(`image fetch failed: ${url.split('/').pop()}`);
    }
  }

  if (input.costCentsPerUnit != null) {
    const units = input.unitsPerListing ?? 1;
    const cost = (input.costCentsPerUnit * units) / 100;
    const net = (input.priceCents / 100) * (1 - EFFECTIVE_FEE_RATE_ON_ITEM);
    if (net < cost) {
      errors.push(`price nets $${net.toFixed(2)} against $${cost.toFixed(2)} cost, a loss`);
    } else if (net - cost < cost * 0.05) {
      warnings.push(`thin margin: nets $${net.toFixed(2)} on $${cost.toFixed(2)} cost`);
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}

/** Prints the result and throws on a hard failure. */
export function assertPreflight(sku: string, r: PreflightResult) {
  for (const w of r.warnings) console.log(`  preflight warning [${sku}]: ${w}`);
  if (!r.ok) {
    for (const e of r.errors) console.error(`  preflight ERROR [${sku}]: ${e}`);
    throw new Error(`preflight failed for ${sku}, not publishing`);
  }
  console.log(`  preflight ok [${sku}]`);
}
