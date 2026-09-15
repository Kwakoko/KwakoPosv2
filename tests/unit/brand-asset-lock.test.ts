import { describe, expect, it } from "vitest";
import { KWAKOKO_VISUAL_ASSET_LIBRARY } from "@kwakopos2/config";

describe("Kwakoko brand asset lock", () => {
  it("uses the canonical production asset authority", () => {
    expect(KWAKOKO_VISUAL_ASSET_LIBRARY.version).toBe("1.0.0");
    expect(KWAKOKO_VISUAL_ASSET_LIBRARY.status).toBe("PRODUCTION_LOCKED");
    expect(KWAKOKO_VISUAL_ASSET_LIBRARY.brand).toBe("Kwakoko");
  });

  it("keeps the master brand and Koko promise canonical", () => {
    expect(KWAKOKO_VISUAL_ASSET_LIBRARY.tagline).toBe("Run your business as one.");
    expect(KWAKOKO_VISUAL_ASSET_LIBRARY.kokoPromise).toBe("Koko never forgets your business.");
    expect(KWAKOKO_VISUAL_ASSET_LIBRARY.mascot).toBe("Koko");
  });

  it("prohibits critical-workflow mascot interference", () => {
    expect(KWAKOKO_VISUAL_ASSET_LIBRARY.rules.noKokoCriticalWorkflowInterference).toBe(true);
  });
});
