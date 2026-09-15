import { describe, expect, it } from "vitest";
import { KWAKOKO_SECURITY_TRUST_GOVERNANCE } from "../../packages/config/src/securityTrustGovernance.js";
describe("Kwakoko security and trust governance",()=>{
 it("defines the trust layers",()=>expect(KWAKOKO_SECURITY_TRUST_GOVERNANCE.layers).toContain("tenant-isolation"));
 it("requires production secrets",()=>expect(KWAKOKO_SECURITY_TRUST_GOVERNANCE.invariants.some(x=>x.includes("JWT_SECRET"))).toBe(true));
 it("requires trusted tenant context and fail-closed boundaries",()=>expect(KWAKOKO_SECURITY_TRUST_GOVERNANCE.invariants.join(" ")).toContain("Cross-tenant access"));
 it("forbids absolute security claims",()=>expect(KWAKOKO_SECURITY_TRUST_GOVERNANCE.invariants.join(" ")).toContain("never claim absolute security"));
 it("protects Koko from security decisions",()=>expect(KWAKOKO_SECURITY_TRUST_GOVERNANCE.securityUx.noMascotInterference).toBe(true));
 it("defines the release certificate",()=>expect(KWAKOKO_SECURITY_TRUST_GOVERNANCE.certification.certificate).toBe("KWAKOKO-SECURITY-TRUST-CERTIFICATE-v1.0"));
});
