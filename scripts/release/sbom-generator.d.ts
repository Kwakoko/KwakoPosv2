export interface SBOMDocument {
    spdxVersion: string;
    dataLicense: string;
    SPDXID: string;
    name: string;
    documentNamespace: string;
    creationInfo: {
        creators: string[];
        created: string;
    };
    packages: Array<{
        name: string;
        SPDXID: string;
        versionInfo: string;
        downloadLocation: string;
        licenseConcluded: string;
        checksums?: Array<{
            algorithm: string;
            checksumValue: string;
        }>;
    }>;
}
export declare function generateSBOM(versionStr?: string): {
    spdx: SBOMDocument;
    cyclonedx: any;
    spdxPath: string;
};
//# sourceMappingURL=sbom-generator.d.ts.map