import { Store } from "../../packages/storage/index.js";
import { config } from "../../packages/shared/config.js";
import { seed } from "./auth.js";
import { createApp } from "./app.js";
const store = new Store();
await seed(store);
const { app, experiments } = createApp(store);
await experiments.recover();
const server = app.listen(config.API_PORT, "0.0.0.0", (error?: Error) => {
  if (error) {
    console.error(error);
    process.exit(1);
  }
  console.log(`CausalScope API :${config.API_PORT} (${config.STORAGE_MODE})`);
});
server.on("error", (error) => {
  console.error(error);
  process.exit(1);
});
