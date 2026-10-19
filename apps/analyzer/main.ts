import { Store } from "../../packages/storage/index.js";
import { scope } from "../../packages/shared/index.js";
import { runAnalysis } from "./worker.js";
const store = new Store();
let running = false;
setInterval(async () => {
  if (running) return;
  running = true;
  try {
    await runAnalysis(
      store,
      scope.workspace,
      scope.environment,
      Date.now() - 300000,
      Date.now(),
      true,
    );
    await store.prune();
  } catch (e) {
    console.error("Analysis failed:", e instanceof Error ? e.message : e);
  } finally {
    running = false;
  }
}, 5000);
console.log("Analysis worker running, bounded five-minute windows");
