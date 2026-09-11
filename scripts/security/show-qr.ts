import QRCode from "qrcode";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const secret = "A75BM3WEJIOOMCJW75BRIMK7XNOA4XWQ";
const email = "admin@kwakoko.co.tz";
const issuer = "KwakoPos";
const otpUri = `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(email)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;

async function main() {
  console.log("\n=======================================================");
  console.log("   KWAKOPOS V2.0.0 — SUPER ADMIN 2FA TOTP QR SETUP     ");
  console.log("=======================================================\n");
  console.log(`Account : ${email}`);
  console.log(`Issuer  : ${issuer}`);
  console.log(`Secret  : ${secret}`);
  console.log(`URI     : ${otpUri}\n`);

  // 1. Output Terminal QR code
  const terminalQr = await QRCode.toString(otpUri, { type: "terminal", small: true });
  console.log(terminalQr);

  // 2. Save SVG & HTML helper files
  const outDir = path.resolve(__dirname, "../../artifacts/security");
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const svgPath = path.join(outDir, "superadmin-totp-qr.svg");
  const svgContent = await QRCode.toString(otpUri, { type: "svg", margin: 2 });
  fs.writeFileSync(svgPath, svgContent, "utf-8");

  const htmlPath = path.join(outDir, "superadmin-totp-qr.html");
  const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>KwakoPos Super Admin TOTP QR</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #f8fafc; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; }
    .card { background: #1e293b; border: 1px solid #334155; border-radius: 16px; padding: 32px; max-width: 440px; text-align: center; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5); }
    h1 { font-size: 20px; margin-bottom: 8px; color: #38bdf8; }
    p { font-size: 14px; color: #94a3b8; margin-bottom: 24px; }
    .qr-box { background: #ffffff; padding: 16px; border-radius: 12px; display: inline-block; margin-bottom: 20px; }
    .qr-box svg { display: block; width: 240px; height: 240px; }
    .secret-box { background: #0f172a; border: 1px solid #334155; border-radius: 8px; padding: 12px; font-family: monospace; font-size: 14px; color: #fbbf24; word-break: break-all; margin-bottom: 12px; }
    .note { font-size: 12px; color: #64748b; }
  </style>
</head>
<body>
  <div class="card">
    <h1>KwakoPos Super Admin MFA Setup</h1>
    <p>Scan this QR code with Google Authenticator, Microsoft Authenticator, or 2FAS.</p>
    <div class="qr-box">
      ${svgContent}
    </div>
    <div class="secret-box">${secret}</div>
    <div class="note">Account: admin@kwakoko.co.tz • 6 Digits • 30s</div>
  </div>
</body>
</html>`;
  fs.writeFileSync(htmlPath, htmlContent, "utf-8");

  console.log(`\n✅ Saved SVG to:  ${svgPath}`);
  console.log(`✅ Saved HTML to: ${htmlPath}`);
  console.log("=======================================================\n");
}

main().catch(err => {
  console.error("Error generating QR code:", err);
  process.exit(1);
});
