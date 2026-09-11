import { createHmac } from "node:crypto";

function base32Decode(input: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0, value = 0; const bytes: number[] = [];
  for (const char of input.replace(/=+$/g, "").toUpperCase()) {
    const index = alphabet.indexOf(char);
    if (index < 0) throw new Error("Invalid character");
    value = (value << 5) | index; bits += 5;
    if (bits >= 8) { bytes.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(bytes);
}

function hotp(secret: string, counter: number): string {
  const key = base32Decode(secret);
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", key).update(msg).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = ((digest[offset] & 0x7f) << 24) | ((digest[offset + 1] & 0xff) << 16) | ((digest[offset + 2] & 0xff) << 8) | (digest[offset + 3] & 0xff);
  return String(binary % 1_000_000).padStart(6, "0");
}

const secret = "A75BM3WEJIOOMCJW75BRIMK7XNOA4XWQ";
const now = Date.now();
const counter = Math.floor(now / 1000 / 30);
const remaining = 30 - (Math.floor(now / 1000) % 30);

console.log(JSON.stringify({
  secret,
  currentCode: hotp(secret, counter),
  remainingSeconds: remaining,
  nextCode: hotp(secret, counter + 1),
  nextNextCode: hotp(secret, counter + 2),
}, null, 2));
