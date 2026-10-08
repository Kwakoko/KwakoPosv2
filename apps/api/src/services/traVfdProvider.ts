import { createSign } from "node:crypto";
import type { TraVfdProviderEnvironment } from "@kwakopos2/contracts";

const URLS = {
  TEST: { register: "https://virtual.tra.go.tz/efdmsRctApi/api/vfdRegReq", token: "https://virtual.tra.go.tz/efdmsRctApi/vfdtoken", receipt: "https://virtual.tra.go.tz/efdmsRctApi/api/efdmsRctInfo", verify: "https://virtual.tra.go.tz/efdmsRctVerify/" },
  PRODUCTION: { register: "https://vfd.tra.go.tz/api/vfdRegReq", token: "https://vfd.tra.go.tz/vfdtoken", receipt: "https://vfd.tra.go.tz/api/efdmsRctInfo", verify: "https://verify.tra.go.tz/" },
} as const;

export interface TraVfdProviderConfig {
  environment: TraVfdProviderEnvironment;
  tin: string; certSerial: string; certKey: string; privateKeyPem: string;
  username: string; password: string; registrationId: string; efdSerial: string;
  receiptCode: string; routingKey: string;
}
export interface TraVfdReceiptInput {
  date: string; time: string; receiptNumber: string; dailyCounter: number; globalCounter: number;
  zNumber: string; receiptVNumber: string; customerId: string; customerName: string;
  customerMobile: string; customerIdType: number;
  items: Array<{ id: string; description: string; quantity: number; unitPrice: number; discount: number; taxCode: number }>;
  payments: Array<{ type: string; amount: number }>;
}

const xmlEscape = (v: unknown) => String(v == null ? "" : v).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
const tag = (name: string, value: unknown) => "<" + name + ">" + xmlEscape(value) + "</" + name + ">";
const tagText = (xml: string, name: string) => {
  const m = xml.match(new RegExp("<" + name + ">(.*?)</" + name + ">", "is"));
  return m ? m[1].trim() : null;
};
const numTag = (xml: string, name: string) => { const n = Number(tagText(xml, name)); return Number.isFinite(n) ? n : null; };
const normalizePayment = (value: string) => {
  const v = String(value || "").toUpperCase();
  if (v.includes("CARD")) return "CCARD";
  if (v.includes("CHEQUE")) return "CHEQUE";
  if (v.includes("MOBILE") || v.includes("EMONEY") || v.includes("MONEY")) return "EMONEY";
  if (v.includes("CREDIT") || v.includes("INVOICE")) return "INVOICE";
  return "CASH";
};
function buildReceiptXml(input: TraVfdReceiptInput, config: TraVfdProviderConfig): string {
  const items = input.items.map(item => "<ITEM>" + tag("ID", item.id) + tag("DESC", item.description) + tag("QTY", item.quantity) + tag("TAXCODE", item.taxCode) + tag("AMT", (item.quantity * item.unitPrice).toFixed(2)) + "</ITEM>").join("");
  const discount = input.items.reduce((s, i) => s + Number(i.discount || 0), 0);
  const total = input.items.reduce((s, i) => s + Number(i.quantity || 0) * Number(i.unitPrice || 0), 0) - discount;
  const taxable = input.items.filter(i => Number(i.taxCode) === 1).reduce((s, i) => s + Number(i.quantity || 0) * Number(i.unitPrice || 0) - Number(i.discount || 0), 0);
  const tax = Math.max(0, Math.round((taxable - taxable / 1.18) * 100) / 100);
  const netTaxable = Math.max(0, taxable - tax);
  const vatTotal = `<VATTOTAL><VATRATE>A</VATRATE><NETTAMOUNT>${netTaxable.toFixed(2)}</NETTAMOUNT><TAXAMOUNT>${tax.toFixed(2)}</TAXAMOUNT></VATTOTAL>`;
  const base = "<RCT>" + tag("DATE", input.date) + tag("TIME", input.time) + tag("TIN", config.tin) + tag("REGID", config.registrationId) + tag("EFDSERIAL", config.efdSerial) + tag("CUSTIDTYPE", input.customerIdType) + tag("CUSTID", input.customerId) + tag("CUSTNAME", input.customerName) + tag("MOBILENUM", input.customerMobile) + tag("RCTNUM", input.receiptNumber) + tag("DC", input.dailyCounter) + tag("GC", input.globalCounter) + tag("ZNUM", input.zNumber) + tag("RCTVNUM", input.receiptVNumber) + "<ITEMS>" + items + "</ITEMS>" + "<TOTALS>" + tag("TOTALTAXEXCL", (total - tax).toFixed(2)) + tag("TOTALTAXINCL", total.toFixed(2)) + tag("DISCOUNT", discount.toFixed(2)) + "</TOTALS>" + "<PAYMENTS>" + input.payments.map(p => "<PAYMENT>" + tag("PMTTYPE", normalizePayment(p.type)) + tag("PMTAMOUNT", Number(p.amount || 0).toFixed(2)) + "</PAYMENT>").join("") + "</PAYMENTS>" + "<VATTOTALS>" + vatTotal + "</VATTOTALS></RCT>";
  const canonical = base.replace("<VATTOTALS></VATTOTALS>", "<VATTOTALS></VATTOTALS>");
  const signer = createSign("RSA-SHA1"); signer.update(canonical); signer.end();
  const signature = signer.sign(config.privateKeyPem, "base64");
  return "<?xml version=\"1.0\" encoding=\"UTF-8\"?><EFDMS>" + canonical + "<EFDMSSIGNATURE>" + signature + "</EFDMSSIGNATURE></EFDMS>";
}

function envName(key: string): string { return "TRA_VFD_" + key.replace(/[A-Z]/g, m => "_" + m).toUpperCase(); }
function configFromEnv(tenantId: string): TraVfdProviderConfig | null {
  let override: Record<string, string> = {};
  const raw = process.env.TRA_VFD_TENANT_CONFIG_JSON;
  if (raw) { try { override = JSON.parse(raw)[tenantId] || {}; } catch { throw new Error("TRA_VFD_TENANT_CONFIG_JSON_INVALID"); } }
  const read = (key: keyof TraVfdProviderConfig, fallback = "") => String(override[key] ?? process.env[envName(String(key))] ?? fallback);
  const environment = read("environment", process.env.TRA_VFD_ENVIRONMENT || "TEST").toUpperCase() as TraVfdProviderEnvironment;
  if (environment !== "TEST" && environment !== "PRODUCTION") throw new Error("TRA_VFD_ENVIRONMENT_INVALID");
  const cfg = { environment, tin: read("tin"), certSerial: read("certSerial"), certKey: read("certKey"), privateKeyPem: read("privateKeyPem"), username: read("username"), password: read("password"), registrationId: read("registrationId"), efdSerial: read("efdSerial"), receiptCode: read("receiptCode"), routingKey: read("routingKey", "vfdrct") } as TraVfdProviderConfig;
  return Object.entries(cfg).every(([k, v]) => k === "environment" || String(v).trim()) ? cfg : null;
}
function httpError(status: number, body: string): Error { return new Error("TRA_VFD_HTTP_" + status + ":" + body.slice(0, 500)); }

export class TraVfdProvider {
  constructor(private readonly config: TraVfdProviderConfig) {}
  static resolve(tenantId: string) { const config = configFromEnv(tenantId); return config ? new TraVfdProvider(config) : null; }
  static urls(environment: TraVfdProviderEnvironment) { return URLS[environment]; }

  async fetchToken(): Promise<string> {
    const body = new URLSearchParams({ username: this.config.username, password: this.config.password, grant_type: "password" });
    const res = await fetch(URLS[this.config.environment].token, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body });
    const raw = await res.text(); if (!res.ok) throw httpError(res.status, raw);
    let parsed: any = {}; try { parsed = JSON.parse(raw); } catch { /* XML/HTML error handled below */ }
    const token = parsed.access_token || parsed.accessToken; if (!token) throw new Error("TRA_VFD_TOKEN_NOT_RETURNED");
    return String(token);
  }

  async submitReceipt(input: TraVfdReceiptInput) {
    const token = await this.fetchToken();
    const xml = buildReceiptXml(input, this.config);
    const res = await fetch(URLS[this.config.environment].receipt, { method: "POST", headers: { "content-type": "application/xml", "routing-key": this.config.routingKey || "vfdrct", "cert-serial": Buffer.from(this.config.certSerial, "utf8").toString("base64"), authorization: "bearer " + token }, body: xml });
    const raw = await res.text(); if (!res.ok) throw httpError(res.status, raw);
    const code = numTag(raw, "ACKCODE"); const number = numTag(raw, "RCTNUM"); const date = tagText(raw, "DATE"); const time = tagText(raw, "TIME"); const message = tagText(raw, "ACKMSG");
    if (code !== 0) throw new Error("TRA_VFD_REJECTED:" + String(code == null ? "UNKNOWN" : code) + ":" + String(message || "ACKCODE is not zero"));
    const verificationCode = tagText(raw, "RECEIPTCODE") || tagText(raw, "RCTVCODE") || tagText(raw, "VERIFICATIONCODE") || this.config.receiptCode;
    const verificationUrl = verificationCode && input.globalCounter > 0 ? URLS[this.config.environment].verify + verificationCode + String(input.globalCounter) + "_" + String(time || input.time).replaceAll(":", "") : "";
    return { number, date, time, code, message, verificationCode, verificationUrl, raw };
  }
  async verifyReceipt(verificationUrl: string, expected: { receiptNumber: string; tin: string; totalIncl: number; verificationCode?: string | null }) {
    if (!verificationUrl) return { matched: false, details: {}, raw: "" };
    const res = await fetch(verificationUrl, { method: "GET" }); const raw = await res.text(); if (!res.ok) throw httpError(res.status, raw);
    const receiptNumber = (raw.match(/RECEIPT NO:\\s*([^<\\r\\n]+)/i) || [])[1]?.trim() || null;
    const tin = (raw.match(/TIN:\\s*([^<\\r\\n]+)/i) || [])[1]?.trim() || null;
    const totalText = (raw.match(/TOTAL INCL OF TAX:\\s*([0-9,.]+)/i) || [])[1] || "";
    const verificationCode = (raw.match(/RECEIPT VERIFICATION CODE\\s*([A-Z0-9]+)/i) || [])[1] || null;
    const totalIncl = Number(totalText.replaceAll(",", ""));
    const matched = receiptNumber === expected.receiptNumber && tin === expected.tin && Number.isFinite(totalIncl) && Math.abs(totalIncl - expected.totalIncl) < 0.01 && (!expected.verificationCode || !verificationCode || verificationCode === expected.verificationCode);
    return { matched, details: { receiptNumber: receiptNumber || "", tin: tin || "", totalIncl: String(totalIncl), verificationCode: verificationCode || "" }, raw };
  }
}

export const createTraVfdProvider = (tenantId: string) => TraVfdProvider.resolve(tenantId);
