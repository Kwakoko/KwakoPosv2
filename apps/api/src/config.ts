import { loadConfig as baseLoadConfig } from "@kwakopos2/config";

export function loadConfig() {
  const config = baseLoadConfig();
  return {
    ...config,
    KWAKOPOS_BOOTSTRAP_ADMIN_EMAIL: process.env.KWAKOPOS_BOOTSTRAP_ADMIN_EMAIL || "admin@kwakopos.local",
  };
}
