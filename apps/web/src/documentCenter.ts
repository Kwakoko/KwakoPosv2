// ============================================================
// Phase 40 — KwakoPos Document Command Center UI (KDAOL v1.0.0)
// ============================================================

export interface DocumentUiProps {
  tenantId: string;
  totalDocumentsCount: number;
  totalStorageSizeBytes: number;
  confidentialDocumentsCount: number;
  ocrExtractedCount: number;
}

export function renderDocumentCommandCenter(props: DocumentUiProps): string {
  const mbSize = (props.totalStorageSizeBytes / (1024 * 1024)).toFixed(2);

  return `
<div class="kdaol-command-center" style="background: #0f172a; color: #f8fafc; font-family: 'Inter', sans-serif; padding: 24px; border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
    <h2 style="margin: 0; font-size: 1.25rem; color: #38bdf8; font-weight: 700;">
      <span style="background: #0284c7; color: white; font-size: 0.75rem; padding: 2px 8px; border-radius: 4px; margin-right: 8px;">KDAOL v1.0.0</span>
      Document & Asset Operating Layer
    </h2>
    <span style="font-size: 0.85rem; color: #94a3b8;">Tenant ID: <strong style="color: #cbd5e1;">${props.tenantId}</strong></span>
  </div>

  <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px;">
    <div style="background: #1e293b; border-left: 4px solid #38bdf8; padding: 16px; border-radius: 8px;">
      <div style="font-size: 0.75rem; color: #94a3b8; text-transform: uppercase;">Total Documents</div>
      <div style="font-size: 1.5rem; font-weight: 700; color: #f8fafc; margin-top: 4px;">${props.totalDocumentsCount}</div>
    </div>
    <div style="background: #1e293b; border-left: 4px solid #34d399; padding: 16px; border-radius: 8px;">
      <div style="font-size: 0.75rem; color: #94a3b8; text-transform: uppercase;">Storage Usage</div>
      <div style="font-size: 1.5rem; font-weight: 700; color: #34d399; margin-top: 4px;">${mbSize} MB</div>
    </div>
    <div style="background: #1e293b; border-left: 4px solid #fbbf24; padding: 16px; border-radius: 8px;">
      <div style="font-size: 0.75rem; color: #94a3b8; text-transform: uppercase;">Confidential Files</div>
      <div style="font-size: 1.5rem; font-weight: 700; color: #fbbf24; margin-top: 4px;">${props.confidentialDocumentsCount}</div>
    </div>
    <div style="background: #1e293b; border-left: 4px solid #a855f7; padding: 16px; border-radius: 8px;">
      <div style="font-size: 0.75rem; color: #94a3b8; text-transform: uppercase;">OCR Extracted</div>
      <div style="font-size: 1.5rem; font-weight: 700; color: #a855f7; margin-top: 4px;">${props.ocrExtractedCount}</div>
    </div>
  </div>
</div>
  `;
}
