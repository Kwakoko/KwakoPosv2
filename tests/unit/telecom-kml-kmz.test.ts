import { describe, it, expect } from "vitest";
import { randomUUID } from "crypto";
import { KmlKmzParserEngine } from "@kwakopos2/domain";
import type { TenantContext } from "@kwakopos2/contracts";

describe("Phase 5 Telecom KML/KMZ Parsing & Security Engine", () => {
  const ctx: TenantContext = {
    tenantId: randomUUID(),
    branchId: randomUUID(),
    userId: randomUUID(),
    roles: ["ADMIN"],
    permissions: ["ALL"],
  };

  const sampleKml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Telecom Tower Sites</name>
    <Placemark>
      <name>Site-Alpha-01</name>
      <description>Greenfield macro tower in Mwenge</description>
      <Point>
        <coordinates>39.2241,-6.7725,45.0</coordinates>
      </Point>
    </Placemark>
    <Placemark>
      <name>Site-Beta-02</name>
      <description>Rooftop tower in Posta</description>
      <Point>
        <coordinates>39.2891,-6.8163,30.0</coordinates>
      </Point>
    </Placemark>
    <Placemark>
      <name>Microwave-Link-AB</name>
      <LineString>
        <coordinates>
          39.2241,-6.7725,45.0
          39.2891,-6.8163,30.0
        </coordinates>
      </LineString>
    </Placemark>
  </Document>
</kml>`;

  it("safely parses KML Placemarks and normalizes coordinates", () => {
    const result = KmlKmzParserEngine.parseKmlString(sampleKml, "test_sites.kml");
    expect(result.totalPlacemarks).toBe(3);
    expect(result.sha256Hash).toBeDefined();
    expect(result.sha256Hash.length).toBe(64);

    const site1 = result.placemarks.find((p) => p.name === "Site-Alpha-01");
    expect(site1).toBeDefined();
    expect(site1!.geometryType).toBe("Point");
    expect(site1!.coordinates[0].latitude).toBeCloseTo(-6.7725, 4);
    expect(site1!.coordinates[0].longitude).toBeCloseTo(39.2241, 4);
    expect(site1!.coordinates[0].elevationMeters).toBe(45);

    const line = result.placemarks.find((p) => p.name === "Microwave-Link-AB");
    expect(line).toBeDefined();
    expect(line!.geometryType).toBe("LineString");
    expect(line!.coordinates.length).toBe(2);
  });

  it("blocks XML external entity expansion (XXE) attacks", () => {
    const maliciousKml = `<?xml version="1.0" encoding="UTF-8"?>
    <!DOCTYPE foo [ <!ENTITY xxe SYSTEM "file:///etc/passwd"> ]>
    <kml><Document><Placemark><name>&xxe;</name></Placemark></Document></kml>`;

    expect(() => KmlKmzParserEngine.parseKmlString(maliciousKml, "hack.kml")).toThrow(
      /KML_SECURITY_VIOLATION/
    );
  });

  it("creates an immutable KmlImportRecord tracking source hash and file size", () => {
    const parseResult = KmlKmzParserEngine.parseKmlString(sampleKml, "sites.kml");
    const record = KmlKmzParserEngine.createImportRecord(ctx, parseResult, "sites.kml", "KML");

    expect(record.id).toBeDefined();
    expect(record.tenantId).toBe(ctx.tenantId);
    expect(record.sha256Hash).toBe(parseResult.sha256Hash);
    expect(record.totalPlacemarksParsed).toBe(3);
    expect(record.status).toBe("PARSED_PREVIEW");
  });
});
