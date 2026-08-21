import { useCallback, useMemo, useRef, useState } from 'react';
import { createWriteQueue } from '@/lib/writeQueue';

/**
 * Collection state where every change is written through to encrypted storage.
 *
 * Two properties matter, and both were missing when each mutator hand-rolled
 * its own setState-then-save:
 *
 * - **Updates are functional.** The old mutators closed over the array from
 *   the render that created them, so two mutations in the same tick made the
 *   second map over a stale copy and silently discard the first. A ref holds
 *   the live value; updaters always see it.
 * - **Writes go through a serializing queue** (see `writeQueue.ts`), so a
 *   slow early save can never land after — and durably clobber — a later one,
 *   and a burst of edits collapses into one encrypt-and-write of the final
 *   state instead of one per keystroke of activity.
 *
 * `commit` resolves once the committed state (or something newer) is on disk,
 * so error semantics stay where they were: a blocked vault or failed write
 * rejects at the call site, where the screen can tell the operator, rather
 * than disappearing into a background queue.
 */
export function useStoredCollection<T>(save: (value: T[]) => Promise<void>) {
  const [state, setState] = useState<T[]>([]);
  const live = useRef<T[]>(state);
  const queue = useMemo(() => createWriteQueue<T[]>(save), [save]);

  /** Replaces state without persisting — for loading what storage already holds. */
  const hydrate = useCallback((value: T[]) => {
    live.current = value;
    setState(value);
  }, []);

  /** The value as of right now, not as of the last render. */
  const read = useCallback(() => live.current, []);

  const commit = useCallback(
    async (updater: (previous: T[]) => T[]): Promise<T[]> => {
      const next = updater(live.current);
      live.current = next;
      setState(next);
      await queue.push(next);
      return next;
    },
    [queue],
  );

  return { state, hydrate, read, commit };
}
