import { it, expect } from "vitest";
import { BoundedPool, delay } from "../../apps/demo-system/pool.js";
it("creates genuine bounded resource contention and releases queued leases safely", async () => {
  const pool = new BoundedPool(1, 2),
    first = await pool.acquire();
  let entered = false;
  const waiting = pool.acquire().then((lease) => {
    entered = true;
    expect(lease.wait).toBeGreaterThan(10);
    lease.release();
    lease.release();
  });
  await delay(25);
  expect(entered).toBe(false);
  expect(pool.active).toBe(1);
  first.release();
  await waiting;
  expect(pool.active).toBe(0);
});
