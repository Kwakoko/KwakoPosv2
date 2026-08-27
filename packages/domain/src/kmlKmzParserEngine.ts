import { createHash, randomUUID } from "crypto";
import type { GeoPlacemark, GeoCoordinate, KmlImportRecord, TenantContext } from "@kwakopos2/contracts";

export interface KmlParseResult {
  sha256Hash: string;
  fileSizeBytes: number;
  totalPlacemarks: number;
  placemarks: GeoPlacemark[];
  layers: string[];
}

export class KmlKmzParserEngine {
  public static readonly MAX_KML_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50MB
  public static readonly MAX_PLACEMARKS_LIMIT = 50000;

  /**
   * Generates SHA-256 hash of a file buffer for immutable evidence auditing.
   */
  static calculateSha256(content: Buffer | string): string {
    const hash = createHash("sha256");
    hash.update(content);
    return hash.digest("hex");
  }

  /**
   * Parses raw KML XML string into normalized GeoPlacemark records with security guards.
   */
  static parseKmlString(kmlContent: string, fileName = "import.kml"): KmlParseResult {
    const fileSizeBytes = Buffer.byteLength(kmlContent, "utf8");
    if (fileSizeBytes > this.MAX_KML_FILE_SIZE_BYTES) {
      throw new Error(
        `KML_PARSE_ERROR: File size ${fileSizeBytes} bytes exceeds maximum allowed limit of ${this.MAX_KML_FILE_SIZE_BYTES} bytes.`
      );
    }

    // Security Guard: Check for malicious XML entity injection
    if (/<!ENTITY/i.test(kmlContent) || /SYSTEM\s+["']/i.test(kmlContent)) {
      throw new Error("KML_SECURITY_VIOLATION: XML external entity expansion (XXE) detected and blocked.");
    }

    const sha256Hash = this.calculateSha256(kmlContent);
    const placemarks: GeoPlacemark[] = [];
    const layersSet = new Set<string>();

    // Regex-based placemark parsing (safe against script execution and malicious entities)
    const placemarkRegex = /<Placemark\b[^>]*>([\s\S]*?)<\/Placemark>/gi;
    let match: RegExpExecArray | null;

    while ((match = placemarkRegex.exec(kmlContent)) !== null) {
      if (placemarks.length >= this.MAX_PLACEMARKS_LIMIT) {
        break;
      }

      const placemarkXml = match[1];

      // Extract Name
      const nameMatch = /<name\b[^>]*>([\s\S]*?)<\/name>/i.exec(placemarkXml);
      const rawName = nameMatch ? nameMatch[1].replace(/<!\[CDATA\[(.*?)\]\]>/g, "$1").trim() : `Placemark-${placemarks.length + 1}`;

      // Extract Description
      const descMatch = /<description\b[^>]*>([\s\S]*?)<\/description>/i.exec(placemarkXml);
      const rawDesc = descMatch ? descMatch[1].replace(/<!\[CDATA\[(.*?)\]\]>/g, "$1").trim() : null;

      // Extract Coordinates & Geometry Type
      let geometryType: GeoPlacemark["geometryType"] = "Point";
      let coordinates: GeoCoordinate[] = [];

      const pointCoordMatch = /<Point\b[^>]*>[\s\S]*?<coordinates\b[^>]*>([\s\S]*?)<\/coordinates>[\s\S]*?<\/Point>/i.exec(placemarkXml);
      const lineCoordMatch = /<LineString\b[^>]*>[\s\S]*?<coordinates\b[^>]*>([\s\S]*?)<\/coordinates>[\s\S]*?<\/LineString>/i.exec(placemarkXml);
      const polyCoordMatch = /<Polygon\b[^>]*>[\s\S]*?<coordinates\b[^>]*>([\s\S]*?)<\/coordinates>[\s\S]*?<\/Polygon>/i.exec(placemarkXml);

      if (pointCoordMatch) {
        geometryType = "Point";
        coordinates = this.parseCoordinatesString(pointCoordMatch[1]);
      } else if (lineCoordMatch) {
        geometryType = "LineString";
        coordinates = this.parseCoordinatesString(lineCoordMatch[1]);
      } else if (polyCoordMatch) {
        geometryType = "Polygon";
        coordinates = this.parseCoordinatesString(polyCoordMatch[1]);
      } else {
        // Fallback check for coordinates tag anywhere in Placemark
        const genericCoordMatch = /<coordinates\b[^>]*>([\s\S]*?)<\/coordinates>/i.exec(placemarkXml);
        if (genericCoordMatch) {
          coordinates = this.parseCoordinatesString(genericCoordMatch[1]);
        }
      }

      if (coordinates.length > 0) {
        const layerName = "Sites & Infrastructure";
        layersSet.add(layerName);

        placemarks.push({
          id: randomUUID(),
          name: this.sanitizeString(rawName),
          description: rawDesc ? this.sanitizeString(rawDesc) : null,
          layerName,
          geometryType,
          coordinates,
          extendedData: {},
        });
      }
    }

    return {
      sha256Hash,
      fileSizeBytes,
      totalPlacemarks: placemarks.length,
      placemarks,
      layers: Array.from(layersSet),
    };
  }

  /**
   * Parses KML coordinate strings (e.g. "lon,lat,alt lon,lat,alt").
   */
  static parseCoordinatesString(coordStr: string): GeoCoordinate[] {
    const cleanStr = coordStr.trim();
    if (!cleanStr) return [];

    const tuples = cleanStr.split(/\s+/);
    const coords: GeoCoordinate[] = [];

    for (const tuple of tuples) {
      const parts = tuple.split(",");
      if (parts.length >= 2) {
        const lon = parseFloat(parts[0]);
        const lat = parseFloat(parts[1]);
        const elevation = parts.length >= 3 ? parseFloat(parts[2]) : 0;

        if (!isNaN(lat) && !isNaN(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
          coords.push({
            latitude: Math.round(lat * 1000000) / 1000000,
            longitude: Math.round(lon * 1000000) / 1000000,
            elevationMeters: !isNaN(elevation) ? Math.round(elevation * 100) / 100 : 0,
          });
        }
      }
    }
    return coords;
  }

  /**
   * Sanitizes strings by stripping raw HTML tags or script elements.
   */
  static sanitizeString(input: string): string {
    return input.replace(/<[^>]*>?/gm, "").trim();
  }

  /**
   * Creates an authoritative KmlImportRecord tracking imported placemarks and source hash.
   */
  static createImportRecord(
    ctx: TenantContext,
    parseResult: KmlParseResult,
    fileName: string,
    fileType: "KML" | "KMZ"
  ): KmlImportRecord {
    return {
      id: randomUUID(),
      tenantId: ctx.tenantId,
      fileName,
      fileType,
      fileSizeBytes: parseResult.fileSizeBytes,
      sha256Hash: parseResult.sha256Hash,
      totalPlacemarksParsed: parseResult.totalPlacemarks,
      sitesCreated: 0,
      parsedPlacemarks: parseResult.placemarks,
      importedById: ctx.userId,
      importedAt: new Date().toISOString(),
      status: "PARSED_PREVIEW",
      errorMessage: null,
    };
  }
}
