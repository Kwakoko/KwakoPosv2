import type { PluginManifest } from "@kwakopos2/contracts";
import { StandardPluginCatalog } from "./pluginCatalog.js";
import { IndustryExpansionCatalog } from "./industryExpansionCatalog.js";

/**
 * Canonical catalog used by industry-aware consumers that need the complete
 * Wave 1/2/3 catalog plus the Hardware and Electronics expansion.
 */
export const KwakoPosIndustryCatalog: PluginManifest[] = [
  ...StandardPluginCatalog,
  ...IndustryExpansionCatalog,
];

export function getIndustryManifest(industryOrPluginId: string): PluginManifest | undefined {
  const normalized = industryOrPluginId.trim().toLowerCase();
  return KwakoPosIndustryCatalog.find(
    (manifest) => manifest.id.toLowerCase() === normalized || manifest.industry.toLowerCase() === normalized
  );
}
