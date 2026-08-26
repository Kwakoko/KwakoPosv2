export type DocumentPrefix = "SAL" | "PUR" | "REC" | "RET" | "PAY" | "SES" | "ADJ" | "TRA" | "JRN" | "REV" | "INV" | "BIL";


export class TransactionNumbering {
  /**
   * Generates a collision-resistant sequential document number.
   * Format: <PREFIX>-<BRANCH_CODE>-<YEAR>-<SEQUENTIAL_PAD>
   * Example: SAL-HQ-2026-000042
   */
  static formatNumber(prefix: DocumentPrefix, branchCode: string, sequence: number, date = new Date()): string {
    const year = date.getFullYear();
    const cleanBranch = branchCode.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6) || "MAIN";
    const padSeq = String(sequence).padStart(5, "0");
    return `${prefix}-${cleanBranch}-${year}-${padSeq}`;
  }
}