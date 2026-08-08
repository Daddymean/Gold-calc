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
