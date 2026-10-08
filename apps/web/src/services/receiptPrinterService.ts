import type { ReceiptDTO } from "@kwakopos2/contracts";

export type ThermalPaperWidth = "58mm" | "80mm";

export interface ThermalPrinterPort {
  readable?: unknown;
  writable?: { getWriter(): { write(data: Uint8Array): Promise<void>; releaseLock(): void } };
  open?: (options: { baudRate: number }) => Promise<void>;
}

const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

function line(value = ""): number[] {
  return [...new TextEncoder().encode(value), LF];
}

function centered(value: string): number[] {
  return [ESC, 0x61, 0x01, ...line(value), ESC, 0x61, 0x00];
}

function wrapped(value: string, width: number): string[] {
  const words = value.trim().split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? current + " " + word : word;
    if (next.length > width && current) { lines.push(current); current = word; }
    else current = next;
  }
  if (current) lines.push(current);
  return lines;
}

export function buildEscPosPayload(receipt: Pick<ReceiptDTO, "receiptNumber" | "transactionId" | "createdAt" | "items" | "grandTotal" | "paidAmount" | "changeAmount" | "paymentMethod" | "currency">, paperWidth: ThermalPaperWidth = "80mm"): Uint8Array {
  const width = paperWidth === "58mm" ? 32 : 48;
  const chunks: number[] = [ESC, 0x40, ESC, 0x61, 0x01];
  chunks.push(...line("KWAKOPOS RECEIPT"));
  chunks.push(...line("Receipt: " + receipt.receiptNumber));
  chunks.push(...line(new Date(receipt.createdAt).toLocaleString()));
  chunks.push(...line("Sale: " + receipt.transactionId));
  chunks.push(ESC, 0x61, 0x00);
  chunks.push(...line("-".repeat(width)));
  for (const item of receipt.items) {
    const names = wrapped(String(item.name || item.sku), Math.max(10, width - 14));
    chunks.push(...line(String(item.qty) + " x " + (names[0] || item.sku)));
    for (const extra of names.slice(1)) chunks.push(...line("    " + extra));
    chunks.push(...line(String(item.unitPrice) + "  ->  " + String(item.lineTotal) + " " + receipt.currency));
  }
  chunks.push(...line("-".repeat(width)));
  chunks.push(ESC, 0x45, 0x01);
  chunks.push(...line("TOTAL: " + receipt.grandTotal + " " + receipt.currency));
  chunks.push(ESC, 0x45, 0x00);
  chunks.push(...line("Paid: " + receipt.paidAmount + " " + receipt.currency));
  chunks.push(...line("Change: " + receipt.changeAmount + " " + receipt.currency));
  chunks.push(...line("Method: " + receipt.paymentMethod));
  chunks.push(...centered("Thank you for shopping with us."));
  chunks.push(...centered(receipt.receiptNumber));
  chunks.push(ESC, 0x64, 0x03, GS, 0x56, 0x42, 0x00);
  return new Uint8Array(chunks);
}

export function isThermalPrinterSupported(): boolean {
  return typeof navigator !== "undefined" && "serial" in navigator;
}

export async function requestThermalPrinterPort(): Promise<any> {
  if (!isThermalPrinterSupported()) throw new Error("THERMAL_PRINTER_NOT_SUPPORTED_IN_BROWSER");
  return (navigator as any).serial.requestPort();
}

export async function printReceiptToThermal(receipt: Pick<ReceiptDTO, "receiptNumber" | "transactionId" | "createdAt" | "items" | "grandTotal" | "paidAmount" | "changeAmount" | "paymentMethod" | "currency">, options: { paperWidth?: ThermalPaperWidth; baudRate?: number; port?: ThermalPrinterPort } = {}): Promise<void> {
  const port = options.port || await requestThermalPrinterPort();
  if (!port.writable && typeof port.open === "function") await port.open({ baudRate: options.baudRate || 9600 });
  if (!port.writable) throw new Error("THERMAL_PRINTER_PORT_NOT_WRITABLE");
  const writer = port.writable.getWriter();
  try { await writer.write(buildEscPosPayload(receipt, options.paperWidth || "80mm")); }
  finally { writer.releaseLock(); }
}
