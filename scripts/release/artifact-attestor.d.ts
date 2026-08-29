export interface SLSAProvenanceAttestation {
    _type: "https://in-toto.io/Statement/v0.1";
    subject: Array<{
        name: string;
        digest: {
            sha256: string;
        };
    }>;
    predicateType: "https://slsa.dev/provenance/v0.2";
    predicate: {
        builder: {
            id: string;
        };
        buildType: string;
        invocation: {
            configSource: {
                uri: string;
                digest: {
                    sha256: string;
                };
                entryPoint: string;
            };
            parameters: Record<string, any>;
        };
        materials: Array<{
            uri: string;
            digest: {
                sha256: string;
            };
        }>;
        metadata: {
            buildStartedOn: string;
            buildFinishedOn: string;
            completeness: {
                parameters: boolean;
                environment: boolean;
                materials: boolean;
            };
            reproducible: boolean;
        };
    };
}
export declare function generateArtifactAttestation(versionStr?: string, gitShaStr?: string): {
    attestation: SLSAProvenanceAttestation;
    digest: string;
    attestationPath: string;
};
//# sourceMappingURL=artifact-attestor.d.ts.map