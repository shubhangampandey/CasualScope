import { spawn } from "node:child_process";
import { resolve } from "node:path";
import "dotenv/config";
import net from "node:net";
// Fail before starting children if a required port belongs to another project.
for (const port of [
  Number(process.env.API_PORT) || 4400,
  Number(process.env.INGEST_PORT) || 4319,
  5180,
  ...Array.from({ length: 8 }, (_, i) => 4100 + i),
])
  await new Promise<void>((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", () =>
      reject(
        new Error(
          `Port ${port} is already in use. Stop the existing CausalScope process or configure a separate port before starting.`,
        ),
      ),
    );
    probe.listen(port, "0.0.0.0", () => probe.close(() => resolve()));
  });
const children: ReturnType<typeof spawn>[] = [];
const start = (file: string, args: string[] = []) => {
  const child = spawn(
    process.execPath,
    file.endsWith(".ts") ? ["--import", "tsx", file, ...args] : [file, ...args],
    {
      cwd: process.cwd(),
      env: process.env,
      stdio: "inherit",
      windowsHide: true,
    },
  );
  children.push(child);
  child.on("exit", (code) => {
    if (code && code !== 0) {
      console.error(`${file} exited ${code}`);
      stop();
    }
  });
  return child;
};
start("apps/ingest/main.ts");
start("apps/demo-system/main.ts");
start("apps/api/main.ts");
start("apps/analyzer/main.ts");
start(resolve("node_modules/vite/bin/vite.js"), [
  "--config",
  "apps/web/vite.config.ts",
]);
function stop() {
  for (const child of children) child.kill();
  process.exit();
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
