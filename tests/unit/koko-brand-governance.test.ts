import { describe, expect, it } from "vitest";
import { KOKO_AMBASSADOR, validateKokoAmbassador, getKokoProductMessage } from "@kwakopos2/config";

describe("Koko brand ambassador governance", () => {
  it("validates the canonical Koko definition", () => {
    const koko = validateKokoAmbassador();
    expect(koko.id).toBe("koko");
    expect(koko.species).toBe("African Elephant");
    expect(koko.status).toBe("canonical-v1");
  });

  it("keeps the core promise authoritative", () => {
    expect(KOKO_AMBASSADOR.corePromise).toBe("Koko never forgets your business.");
  });

  it("provides professional product messaging", () => {
    expect(getKokoProductMessage("sync-status")).toBe("Your business data is synchronized.");
  });
});
