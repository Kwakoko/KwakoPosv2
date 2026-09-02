import crypto from "crypto";
import { ReceiptDTO, ReceiptTemplateDTO, ReceiptVerificationDTO } from "@kwakopos2/contracts";

export interface ReceiptNumberOptions {
  tenantPrefix?: string;
  branchPrefix?: string;
  sequenceType?: "DAILY" | "MONTHLY" | "CONTINUOUS";
  sequenceNumber?: number;
  date?: Date;
}

export class ReceiptNumberGenerator {
  private static sequenceCounters: Map<string, number> = new Map();

  public static generate(options: ReceiptNumberOptions = {}): string {
    const d = options.date || new Date();
    const YYYY = d.getFullYear();
    const MM = String(d.getMonth() + 1).padStart(2, "0");
    const DD = String(d.getDate()).padStart(2, "0");

    const tPrefix = options.tenantPrefix ? `${options.tenantPrefix.toUpperCase()}-` : "";
    const bPrefix = options.branchPrefix ? `${options.branchPrefix.toUpperCase()}-` : "";

    let datePart = "";
    if (options.sequenceType === "DAILY") {
      datePart = `${YYYY}${MM}${DD}-`;
    } else if (options.sequenceType === "MONTHLY") {
      datePart = `${YYYY}${MM}-`;
    } else {
      datePart = `${YYYY}${MM}${DD}-`;
    }

    const key = `${tPrefix}${bPrefix}${datePart}`;
    let seq = options.sequenceNumber;
    if (seq === undefined) {
      const current = this.sequenceCounters.get(key) || 0;
      seq = current + 1;
      this.sequenceCounters.set(key, seq);
    }

    const seqFormatted = String(seq).padStart(6, "0");
    return `${tPrefix}${bPrefix}RCPT-${datePart}${seqFormatted}`;
  }
}

export class ReceiptEngine {
  public static calculateDigitalSignature(
    receiptNumber: string,
    transactionId: string,
    amount: number,
    timestamp: string
  ): string {
    const raw = `${receiptNumber}|${transactionId}|${amount.toFixed(2)}|${timestamp}`;
    return crypto.createHash("sha256").update(raw).digest("hex");
  }

  public static generateQrCodePayload(
    receiptId: string,
    receiptNumber: string,
    transactionId: string,
    verificationUrl: string,
    digitalSignature: string
  ): string {
    const baseUrl = verificationUrl || "https://pos.kwako.app/verify-receipt";
    return `${baseUrl}?receiptNumber=${encodeURIComponent(receiptNumber)}&sig=${digitalSignature.slice(0, 16)}&id=${receiptId}`;
  }

  public static generateBarcodePayload(receiptNumber: string): string {
    return receiptNumber.replace(/[^A-Z0-9-]/gi, "");
  }

  public static verifyReceiptSignature(receipt: ReceiptDTO): boolean {
    if (!receipt.digitalSignature) return false;
    const computed = this.calculateDigitalSignature(
      receipt.receiptNumber,
      receipt.transactionId,
      receipt.grandTotal,
      receipt.createdAt
    );
    return computed.toLowerCase() === receipt.digitalSignature.toLowerCase();
  }

  public static renderThermal58mm(receipt: ReceiptDTO, template?: ReceiptTemplateDTO): string {
    const header = template?.headerText || "KWAKOPOS RETAIL OS";
    const footer = template?.footerText || "Thank you for shopping with us!";
    const line = "--------------------------------";

    let out = `${header}\n`;
    out += `${line}\n`;
    out += `Receipt #: ${receipt.receiptNumber}\n`;
    out += `Date:      ${new Date(receipt.createdAt).toLocaleString()}\n`;
    out += `Cashier:   ${receipt.cashierName || receipt.cashierId}\n`;
    if (receipt.customerName) out += `Customer:  ${receipt.customerName}\n`;
    out += `${line}\n`;
    out += `ITEM             QTY   PRICE    TOTAL\n`;
    out += `${line}\n`;

    for (const i of receipt.items) {
      const name = i.name.padEnd(16).slice(0, 16);
      const qty = String(i.qty).padStart(3);
      const price = i.unitPrice.toFixed(0).padStart(7);
      const tot = i.lineTotal.toFixed(0).padStart(8);
      out += `${name} ${qty} ${price} ${tot}\n`;
    }

    out += `${line}\n`;
    out += `Subtotal:      ${receipt.currency} ${receipt.subtotal.toLocaleString()}\n`;
    if (receipt.discountTotal > 0) out += `Discount:      ${receipt.currency} -${receipt.discountTotal.toLocaleString()}\n`;
    out += `Tax (VAT):     ${receipt.currency} ${receipt.taxTotal.toLocaleString()}\n`;
    out += `GRAND TOTAL:   ${receipt.currency} ${receipt.grandTotal.toLocaleString()}\n`;
    out += `Paid (${receipt.paymentMethod}): ${receipt.currency} ${receipt.paidAmount.toLocaleString()}\n`;
    out += `Change:        ${receipt.currency} ${receipt.changeAmount.toLocaleString()}\n`;
    out += `${line}\n`;
    out += `QR Sig: ${receipt.digitalSignature.slice(0, 12)}...\n`;
    out += `${footer}\n`;
    return out;
  }

  public static renderThermal80mm(receipt: ReceiptDTO, template?: ReceiptTemplateDTO): string {
    const header = template?.headerText || "KWAKOPOS ENTERPRISE RECEIPT";
    const footer = template?.footerText || "Thank you for choosing KwakoPos SaaS! Please come again.";
    const line = "------------------------------------------------";

    let out = `             ${header}\n`;
    out += `${line}\n`;
    out += `Receipt Number: ${receipt.receiptNumber}\n`;
    out += `Transaction ID: ${receipt.transactionId} (${receipt.transactionType})\n`;
    out += `Date & Time:    ${new Date(receipt.createdAt).toLocaleString()}\n`;
    out += `Branch / Dev:   ${receipt.branchId} / ${receipt.deviceId}\n`;
    out += `Cashier Name:   ${receipt.cashierName || receipt.cashierId}\n`;
    if (receipt.customerName) out += `Customer Name:  ${receipt.customerName} (${receipt.customerPhone || "N/A"})\n`;
    out += `${line}\n`;
    out += `SKU       ITEM DESCRIPTION       QTY   UNIT PRICE   LINE TOTAL\n`;
    out += `${line}\n`;

    for (const i of receipt.items) {
      const sku = i.sku.padEnd(8).slice(0, 8);
      const name = i.name.padEnd(20).slice(0, 20);
      const qty = String(i.qty).padStart(5);
      const price = i.unitPrice.toFixed(0).padStart(10);
      const tot = i.lineTotal.toFixed(0).padStart(11);
      out += `${sku}  ${name}  ${qty}  ${price}  ${tot}\n`;
    }

    out += `${line}\n`;
    out += `Subtotal:                      ${receipt.currency} ${receipt.subtotal.toLocaleString()}\n`;
    if (receipt.discountTotal > 0) out += `Discount:                      ${receipt.currency} -${receipt.discountTotal.toLocaleString()}\n`;
    out += `Tax Breakdown (VAT/GST):       ${receipt.currency} ${receipt.taxTotal.toLocaleString()}\n`;
    out += `TOTAL AMOUNT PAYABLE:          ${receipt.currency} ${receipt.grandTotal.toLocaleString()}\n`;
    out += `Amount Paid (${receipt.paymentMethod}):       ${receipt.currency} ${receipt.paidAmount.toLocaleString()}\n`;
    out += `Change Given:                  ${receipt.currency} ${receipt.changeAmount.toLocaleString()}\n`;
    out += `${line}\n`;
    out += `Digital Verification SHA256:\n${receipt.digitalSignature}\n`;
    out += `QR Code Verification URL:\n${receipt.qrCodePayload}\n`;
    out += `${line}\n`;
    out += `${footer}\n`;
    return out;
  }

  public static renderA4Html(receipt: ReceiptDTO, template?: ReceiptTemplateDTO): string {
    const primaryColor = template?.primaryColor || "#0f172a";
    const header = template?.headerText || "KwakoPos SaaS Enterprise Invoice / Receipt";
    const footer = template?.footerText || "Thank you for your business. For support, visit https://kwakopos.com";

    const itemsHtml = receipt.items
      .map(
        (i) => `
      <tr>
        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">${i.sku}</td>
        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;"><strong>${i.name}</strong></td>
        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; text-align: center;">${i.qty}</td>
        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; text-align: right;">${receipt.currency} ${i.unitPrice.toLocaleString()}</td>
        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; text-align: right;">${receipt.currency} ${i.discount.toLocaleString()}</td>
        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; text-align: right;">${receipt.currency} ${i.lineTotal.toLocaleString()}</td>
      </tr>
    `
      )
      .join("");

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Receipt ${receipt.receiptNumber}</title>
  <style>
    body { font-family: ${template?.fontFamily || "Inter, sans-serif"}; color: #334155; margin: 0; padding: 40px; background: #fff; }
    .header-bar { border-bottom: 3px solid ${primaryColor}; padding-bottom: 20px; margin-bottom: 30px; display: flex; justify-content: space-between; align-items: center; }
    .title { font-size: 24px; font-weight: 800; color: ${primaryColor}; }
    .meta-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin-bottom: 30px; display: flex; justify-content: space-between; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
    th { background: #f1f5f9; color: #475569; text-align: left; padding: 12px; font-size: 13px; text-transform: uppercase; }
    .summary-box { width: 320px; margin-left: auto; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; }
    .summary-row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 14px; }
    .grand-total { border-top: 2px solid ${primaryColor}; padding-top: 10px; font-size: 18px; font-weight: 800; color: ${primaryColor}; }
    .footer { margin-top: 40px; border-top: 1px solid #e2e8f0; padding-top: 20px; text-align: center; font-size: 12px; color: #64748b; }
    .badge { display: inline-block; padding: 4px 10px; border-radius: 9999px; background: #dcfce7; color: #166534; font-size: 12px; font-weight: 700; }
  </style>
</head>
<body>
  <div class="header-bar">
    <div>
      <div class="title">${header}</div>
      <div style="font-size: 14px; color: #64748b;">Official Commercial Receipt / Tax Invoice</div>
    </div>
    <div>
      <span class="badge">${receipt.status}</span>
    </div>
  </div>

  <div class="meta-box">
    <div>
      <p style="margin: 0 0 6px 0;"><strong>Receipt #:</strong> ${receipt.receiptNumber}</p>
      <p style="margin: 0 0 6px 0;"><strong>Transaction ID:</strong> ${receipt.transactionId}</p>
      <p style="margin: 0;"><strong>Type:</strong> ${receipt.transactionType}</p>
    </div>
    <div>
      <p style="margin: 0 0 6px 0;"><strong>Date:</strong> ${new Date(receipt.createdAt).toLocaleString()}</p>
      <p style="margin: 0 0 6px 0;"><strong>Cashier:</strong> ${receipt.cashierName || receipt.cashierId}</p>
      <p style="margin: 0;"><strong>Customer:</strong> ${receipt.customerName || "Walk-in Customer"}</p>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>SKU</th>
        <th>Description</th>
        <th style="text-align: center;">Qty</th>
        <th style="text-align: right;">Unit Price</th>
        <th style="text-align: right;">Discount</th>
        <th style="text-align: right;">Line Total</th>
      </tr>
    </thead>
    <tbody>
      ${itemsHtml}
    </tbody>
  </table>

  <div class="summary-box">
    <div class="summary-row"><span>Subtotal:</span> <span>${receipt.currency} ${receipt.subtotal.toLocaleString()}</span></div>
    <div class="summary-row"><span>Discount:</span> <span>-${receipt.currency} ${receipt.discountTotal.toLocaleString()}</span></div>
    <div class="summary-row"><span>Tax (VAT/GST):</span> <span>${receipt.currency} ${receipt.taxTotal.toLocaleString()}</span></div>
    <div class="summary-row grand-total"><span>Grand Total:</span> <span>${receipt.currency} ${receipt.grandTotal.toLocaleString()}</span></div>
    <div class="summary-row" style="margin-top: 10px;"><span>Payment (${receipt.paymentMethod}):</span> <span>${receipt.currency} ${receipt.paidAmount.toLocaleString()}</span></div>
    <div class="summary-row"><span>Change:</span> <span>${receipt.currency} ${receipt.changeAmount.toLocaleString()}</span></div>
  </div>

  <div style="margin-top: 30px; background: #f1f5f9; padding: 15px; border-radius: 6px; font-family: monospace; font-size: 11px; word-break: break-all;">
    <strong>SHA256 Digital Signature & Tamper Seal:</strong><br />
    ${receipt.digitalSignature}
  </div>

  <div class="footer">
    <p>${footer}</p>
    <p>Verification QR Payload: ${receipt.qrCodePayload}</p>
  </div>
</body>
</html>
    `;
  }

  public static prepareSharePayload(
    receipt: ReceiptDTO,
    channel: "EMAIL" | "SMS" | "WHATSAPP"
  ): { recipient?: string; subject?: string; body: string } {
    if (channel === "SMS") {
      return {
        recipient: receipt.customerPhone,
        body: `Receipt ${receipt.receiptNumber} from KwakoPos. Total: ${receipt.currency} ${receipt.grandTotal.toLocaleString()}. Verify: ${receipt.qrCodePayload}`,
      };
    } else if (channel === "WHATSAPP") {
      const text = encodeURIComponent(
        `Hello ${receipt.customerName || "Customer"}! Here is your official receipt *${receipt.receiptNumber}* from KwakoPos.\n\n*Total Amount:* ${receipt.currency} ${receipt.grandTotal.toLocaleString()}\n*Payment Method:* ${receipt.paymentMethod}\n*Date:* ${new Date(receipt.createdAt).toLocaleString()}\n\nVerify receipt online: ${receipt.qrCodePayload}`
      );
      const phone = receipt.customerPhone ? receipt.customerPhone.replace(/[^0-9]/g, "") : "";
      return {
        recipient: phone,
        body: `https://wa.me/${phone}?text=${text}`,
      };
    } else {
      return {
        recipient: receipt.customerEmail,
        subject: `Your KwakoPos Receipt - ${receipt.receiptNumber}`,
        body: this.renderA4Html(receipt),
      };
    }
  }
}
