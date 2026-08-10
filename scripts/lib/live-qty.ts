/**
 * Decide how many units a publish may offer, so a revise can never put sold
 * stock back on the shelf.
 *
 * Origin: on 2026-08-07 the Chrome Update NBA mega listing took 3 orders
 * against 2 boxes. eBay did not oversell. The listing script set
 * availableQuantity from a hardcoded constant on every publish, so two
 * cosmetic revises (a title tweak, then a package-weight fix) each reset the
 * quantity back to 2 after a unit had already sold.
 *
 * The invariant that actually holds is:
 *
 *     offered <= vault held, and the vault must already know about every
 *     eBay sale on this listing.
 *
 * The second clause matters. At the moment of the first bad revise the vault
 * still said 2 held because the sale had not been booked yet, so a naive
 * min(desired, held) would have allowed it. Blocking on an unreconciled sale
 * is what closes the hole. It also permits a genuine restock: buy more, log
 * the purchase, and the cap rises on its own.
 */
export type QtyDecision = { qty: number; note: string; blocked: boolean };

export async function quantityForPublish(opts: {
  sku: string;
  desiredQty: number;
  /** Units on hand per the vault. */
  heldQty: number;
  /** Sales rows already booked against this eBay listing id. */
  loggedSales: number;
  getOffer: (sku: string) => Promise<any | null>;
}): Promise<QtyDecision> {
  const offer = await opts.getOffer(opts.sku).catch(() => null);
  const ebaySold = Number(offer?.listing?.soldQuantity ?? 0);
  const unreconciled = Math.max(0, ebaySold - opts.loggedSales);

  if (unreconciled > 0) {
    return {
      qty: 0,
      blocked: true,
      note: `BLOCKED: eBay shows ${ebaySold} sold, vault has ${opts.loggedSales} booked. Log the missing ${unreconciled} sale(s) first, otherwise this publish would relist stock that is already gone.`,
    };
  }

  const qty = Math.min(opts.desiredQty, opts.heldQty);
  if (qty <= 0) {
    return { qty: 0, blocked: true, note: `NOT PUBLISHING: vault holds ${opts.heldQty}` };
  }
  const note =
    qty < opts.desiredQty
      ? `capped to vault held ${opts.heldQty} (script wanted ${opts.desiredQty})`
      : `qty ${qty}, within vault held ${opts.heldQty}, eBay sales reconciled`;
  return { qty, blocked: false, note };
}
