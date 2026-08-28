import { describe, expect, it } from "vitest";
import { getIndustryManifest } from "@kwakopos2/domain";
import { PluginManifestSchema } from "@kwakopos2/contracts";

describe("Industry Module Catalog: Wholesale, Restaurant, Pharmacy, Hardware, Electronics", () => {
  const required = ["wholesale", "restaurant", "pharmacy", "hardware", "electronics"];

  it("resolves all five requested industries", () => {
    for (const pluginId of required) {
      const manifest = getIndustryManifest(pluginId);
      expect(manifest, `missing manifest for ${pluginId}`).toBeDefined();
      expect(manifest?.type).toBe("INDUSTRY");
      expect(manifest?.status).toBe("stable");
      expect(manifest?.offlineCapability).toBe("FULLY_OFFLINE");
    }
  });

  it("validates every requested manifest against the plugin contract", () => {
    for (const pluginId of required) {
      const manifest = getIndustryManifest(pluginId);
      expect(() => PluginManifestSchema.parse(manifest)).not.toThrow();
    }
  });

  it("exposes operational routes and tenant-scoped synchronized entities", () => {
    for (const pluginId of required) {
      const manifest = getIndustryManifest(pluginId)!;
      expect(manifest.routes.length).toBeGreaterThan(0);
      expect(manifest.entities.length).toBeGreaterThan(0);
      expect(manifest.entities.every((entity) => entity.isTenantScoped && entity.syncEnabled)).toBe(true);
    }
  });
});
