import { Store } from "../packages/storage/index.js";
import { seed } from "../apps/api/auth.js";
const store = new Store();
await seed(store);
await store.close();
console.log("Northstar Engineering seeded; no fabricated telemetry.");
