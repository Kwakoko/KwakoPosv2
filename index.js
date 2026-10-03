// Single production API entrypoint.
import { pathToFileURL } from "url";

const entrypoint = "apps/api/dist/apps/api/src/serverFixed.js";
const moduleUrl = pathToFileURL(entrypoint).href;

console.log(`Starting KwakoPos 2.0 API from entrypoint: ${entrypoint}`);
const mod = await import(moduleUrl);

if (typeof mod.startFixedServer !== "function") {
  throw new Error(`Invalid API entrypoint: ${entrypoint} does not export startFixedServer()`);
}

await mod.startFixedServer();
