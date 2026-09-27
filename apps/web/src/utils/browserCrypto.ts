/**
 * KwakoPos v2 — Browser Crypto Polyfill / Shim
 * ─────────────────────────────────────────────────────────────────────────────
 * Provides isomorphic primitives (randomUUID, randomBytes, createHash)
 * using the Web Crypto API so that shared domain packages and client modules
 * run safely in the browser without Vite externalization errors.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export function randomUUID(): string {
  if (typeof globalThis !== "undefined" && globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
    try {
      return globalThis.crypto.randomUUID();
    } catch {
      // Fall through to fallback
    }
  }
  // RFC4122 v4 compliant fallback
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function randomBytes(size: number): Uint8Array {
  const bytes = new Uint8Array(size);
  if (typeof globalThis !== "undefined" && globalThis.crypto && typeof globalThis.crypto.getRandomValues === "function") {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < size; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return bytes;
}

/**
 * Fast synchronous SHA-256 implementation for in-browser cryptographic chaining
 * and checksum calculations.
 */
function sha256Sync(str: string): string {
  function rightRotate(value: number, amount: number): number {
    return (value >>> amount) | (value << (32 - amount));
  }

  const mathPow = Math.pow;
  const maxWord = mathPow(2, 32);
  let result = "";

  const words: number[] = [];
  const asciiBitLength = str.length * 8;

  let hash: number[] = [];
  const k: number[] = [];
  let primeCounter = 0;

  const isComposite: Record<number, boolean> = {};
  for (let candidate = 2; primeCounter < 64; candidate++) {
    if (!isComposite[candidate]) {
      for (let i = 0; i < 312; i += candidate) {
        isComposite[i] = true;
      }
      hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0;
      k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
    }
  }

  hash = hash.slice(0, 8);
  const utf8 = unescape(encodeURIComponent(str));
  for (let i = 0; i < utf8.length; i++) {
    const code = utf8.charCodeAt(i);
    words[i >> 2] |= (code & 0xff) << (24 - (i % 4) * 8);
  }
  words[utf8.length >> 2] |= 0x80 << (24 - (utf8.length % 4) * 8);
  words[(((utf8.length + 8) >> 6) << 4) + 15] = asciiBitLength;

  for (let jChunk = 0; jChunk < words.length; jChunk += 16) {
    const w = words.slice(jChunk, jChunk + 16);
    const oldHash = hash.slice(0);

    for (let i = 16; i < 64; i++) {
      const s0 = rightRotate(w[i - 15], 7) ^ rightRotate(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rightRotate(w[i - 2], 17) ^ rightRotate(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }

    let [a, b, c, d, e, f, g, h] = hash;

    for (let i = 0; i < 64; i++) {
      const S1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + k[i] + (w[i] | 0)) | 0;
      const S0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) | 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) | 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) | 0;
    }

    hash[0] = (hash[0] + a) | 0;
    hash[1] = (hash[1] + b) | 0;
    hash[2] = (hash[2] + c) | 0;
    hash[3] = (hash[3] + d) | 0;
    hash[4] = (hash[4] + e) | 0;
    hash[5] = (hash[5] + f) | 0;
    hash[6] = (hash[6] + g) | 0;
    hash[7] = (hash[7] + h) | 0;
  }

  for (let i = 0; i < 8; i++) {
    for (let bit = 3; bit >= 0; bit--) {
      const b = (hash[i] >> (8 * bit)) & 255;
      result += (b < 16 ? "0" : "") + b.toString(16);
    }
  }
  return result;
}

export class BrowserHash {
  private buffer = "";

  constructor(public readonly algorithm: string = "sha256") {}

  update(data: string | Uint8Array | ArrayBuffer): this {
    if (typeof data === "string") {
      this.buffer += data;
    } else if (data instanceof Uint8Array) {
      this.buffer += new TextDecoder().decode(data);
    } else if (data instanceof ArrayBuffer) {
      this.buffer += new TextDecoder().decode(new Uint8Array(data));
    }
    return this;
  }

  digest(encoding: string = "hex"): string {
    return sha256Sync(this.buffer);
  }
}

export function createHash(algorithm: string = "sha256"): BrowserHash {
  return new BrowserHash(algorithm);
}

const browserCrypto = {
  randomUUID,
  randomBytes,
  createHash,
};

export default browserCrypto;
