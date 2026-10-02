// Argon2 is a server-only authority in KwakoPos. The browser bundle must not load Node/WASI bindings.
export const Algorithm = {
  Argon2d: 0,
  Argon2i: 1,
  Argon2id: 2,
} as const;

function serverOnly(): never {
  throw new Error("ARGON2_SERVER_ONLY: password/PIN cryptography must execute on the API server.");
}

export const hash = (..._args: unknown[]): never => serverOnly();
export const verify = (..._args: unknown[]): never => serverOnly();
export const hashSync = (..._args: unknown[]): never => serverOnly();
export const verifySync = (..._args: unknown[]): never => serverOnly();
