import test from 'node:test';
import assert from 'node:assert/strict';
import { createWriteQueue } from '../src/lib/writeQueue.ts';

/** A write whose completion the test controls. */
function gate() {
  let release!: () => void;
  let fail!: (err: Error) => void;
  const opened = new Promise<void>((resolve, reject) => {
    release = resolve;
    fail = reject;
  });
  return { opened, release, fail };
}

const tick = () => new Promise((resolve) => setImmediate(resolve));

test('the newer value can never be overwritten by an older in-flight write', async () => {
  // The race this queue exists to kill: save(A) starts, save(B) starts,
  // B finishes first, then A lands — and the stored book is the older one
  // while the screen shows the newer. Here the first write is made slow on
  // purpose; the final stored value must still be the last one pushed.
  const written: string[] = [];
  const gates: ReturnType<typeof gate>[] = [];
  const queue = createWriteQueue<string>(async (value) => {
    const g = gate();
    gates.push(g);
    await g.opened;
    written.push(value);
  });

  const first = queue.push('older');
  await tick(); // let the first write start and block on its gate
  const second = queue.push('newer');

  // Release the slow first write only after the second push exists.
  gates[0].release();
  await first;
  await tick();
  if (gates[1]) gates[1].release();
  await second;

  assert.equal(written[written.length - 1], 'newer', 'the last durable value is the newest');
});

test('a burst of pushes collapses instead of writing once per edit', async () => {
  let writes = 0;
  let stored = '';
  const queue = createWriteQueue<string>(async (value) => {
    writes += 1;
    stored = value;
  });

  // Nothing has started writing yet, so all three should share one write.
  const a = queue.push('a');
  const b = queue.push('b');
  const c = queue.push('c');
  await Promise.all([a, b, c]);

  assert.equal(writes, 1, 'one write for the burst');
  assert.equal(stored, 'c', 'and it wrote the final state');
});

test('writes never overlap, even when pushes arrive mid-write', async () => {
  let inFlight = 0;
  let maxInFlight = 0;
  const queue = createWriteQueue<number>(async () => {
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await tick();
    inFlight -= 1;
  });

  await Promise.all([queue.push(1), tick().then(() => queue.push(2)), queue.push(3)]);
  assert.equal(maxInFlight, 1, 'the storage layer only ever sees one writer');
});

test('a push during an in-flight write still gets written', async () => {
  const written: number[] = [];
  const first = gate();
  let useGate = true;
  const queue = createWriteQueue<number>(async (value) => {
    if (useGate) {
      useGate = false;
      await first.opened;
    }
    written.push(value);
  });

  const one = queue.push(1);
  await tick(); // write of 1 is now in flight, `scheduled` already cleared
  const two = queue.push(2);
  first.release();
  await Promise.all([one, two]);

  assert.deepEqual(written, [1, 2], 'the mid-write push scheduled its own follow-up');
});

test('a failed write rejects its pusher but does not jam the queue', async () => {
  // The vault latch throws on a blocked write. The caller must see that —
  // their record did not persist — and a later, legitimate write must still
  // go through rather than queueing behind a permanently broken promise.
  let shouldFail = true;
  let stored = '';
  const queue = createWriteQueue<string>(async (value) => {
    if (shouldFail) throw new Error('writes are blocked');
    stored = value;
  });

  await assert.rejects(queue.push('doomed'), /writes are blocked/);
  shouldFail = false;
  await queue.push('recovered');
  assert.equal(stored, 'recovered');
});

test('coalesced pushers all learn the fate of the shared write', async () => {
  const queue = createWriteQueue<string>(async () => {
    throw new Error('disk full');
  });
  const a = queue.push('a');
  const b = queue.push('b');
  await assert.rejects(a, /disk full/);
  await assert.rejects(b, /disk full/);
});
