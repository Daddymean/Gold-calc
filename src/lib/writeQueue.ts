/**
 * A serializing, coalescing write-through queue.
 *
 * Persisting a collection means re-encrypting and rewriting the whole array,
 * which takes real time. Firing those saves as they come has two failure
 * modes, and the second one eats records:
 *
 * - **Amplification.** Three edits in one tick trigger three full encrypt-and-
 *   write cycles when one write of the final state would do.
 * - **Reordering.** Two saves in flight at once can complete in either order.
 *   If the older payload lands last, the newer edit is durably erased — the
 *   book looks right on screen and is wrong on disk, which is the worst
 *   possible combination because nothing ever draws attention to it.
 *
 * The queue holds only the latest value. A push while a write is scheduled
 * just replaces what will be written; a push while a write is *in flight*
 * schedules exactly one more write behind it. Writes therefore never overlap,
 * never regress, and bursts collapse to at most two writes.
 *
 * push() resolves when the pushed value — or something newer — is durably
 * written, and rejects if that write fails. Callers keep ordinary error
 * semantics: a blocked vault or a full disk surfaces at the call site instead
 * of vanishing into a background queue. A failed write never jams the queue;
 * the next push writes again.
 */
export interface WriteQueue<T> {
  push(value: T): Promise<void>;
}

export function createWriteQueue<T>(write: (value: T) => Promise<void>): WriteQueue<T> {
  let latest: T;
  let scheduled = false;
  let chain: Promise<void> = Promise.resolve();

  return {
    push(value: T): Promise<void> {
      latest = value;
      if (!scheduled) {
        scheduled = true;
        chain = chain
          // The previous write's failure belongs to whoever pushed it — it has
          // already rejected their promise — not to this unrelated write.
          .catch(() => {})
          .then(() => {
            // Cleared before reading `latest`, so a push that lands while this
            // write is in flight schedules its own follow-up write rather than
            // assuming this one covered it.
            scheduled = false;
            return write(latest);
          });
      }
      return chain;
    },
  };
}
