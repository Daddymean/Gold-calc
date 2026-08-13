/**
 * Retention policy for stored ID images.
 *
 * Pure and free of native imports so the rule can be reasoned about and tested
 * on its own: it decides *which* records have outlived the window, and the
 * caller does the deleting. Keeping a customer's ID photo longer than local
 * rules require is a liability rather than an asset, so the sweep exists to
 * make forgetting automatic instead of something an operator must remember.
 */

export interface IdPhotoHolder {
  id: string;
  idPhotoUri?: string;
  /** When the record — and so the captured image — was created. */
  createdAt: string;
}

export function expiredIdPhotoOwners(
  customers: IdPhotoHolder[],
  retentionDays: number,
  now: number = Date.now(),
): string[] {
  if (retentionDays <= 0) return [];
  const cutoff = now - retentionDays * 86_400_000;

  return customers
    .filter((customer) => {
      if (!customer.idPhotoUri) return false;
      const captured = new Date(customer.createdAt).getTime();
      // An unparseable date is treated as expired: an ID image whose age cannot
      // be established is exactly the one not worth keeping.
      return Number.isNaN(captured) || captured < cutoff;
    })
    .map((customer) => customer.id);
}


export interface HeldItem {
  id: string;
  purchasedAt: string;
  status: string;
}

/**
 * Items that a configured hold period says cannot be melted yet.
 *
 * The item screen already warns before melting one early; the refining flow
 * has to apply the same rule, or a lot becomes a way to melt held stock
 * without ever seeing the warning.
 */
export function itemsUnderHold(
  items: HeldItem[],
  holdPeriodDays: number,
  now: number = Date.now(),
): string[] {
  if (holdPeriodDays <= 0) return [];
  const cutoff = now - holdPeriodDays * 86_400_000;

  return items
    .filter((item) => {
      if (item.status === 'sold' || item.status === 'melted') return false;
      const bought = new Date(item.purchasedAt).getTime();
      // An unparseable purchase date cannot be shown to have cleared the hold.
      return Number.isNaN(bought) || bought > cutoff;
    })
    .map((item) => item.id);
}
