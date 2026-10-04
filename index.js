// Single production API entrypoint.
import { pathToFileURL } from "url";

const entrypoint = "apps/api/dist/apps/api/src/server.js";
const moduleUrl = pathToFileURL(entrypoint).href;

console.log(`Starting KwakoPos 2.0 API from entrypoint: ${entrypoint}`);
const mod = await import(moduleUrl);

if (typeof mod.startServer !== "function") {
  throw new Error(`Invalid API entrypoint: ${entrypoint} does not export startServer()`);
}

await mod.startServer();
