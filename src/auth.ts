const PBKDF2_ITERATIONS = 100_000;
const DERIVED_KEY_BITS = 256;
const SALT_BYTES = 16;

export const SESSION_COOKIE_NAME = "session";
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

const fromHex = (hex: string): Uint8Array =>
  Uint8Array.from(hex.match(/../g) ?? [], (pair) => Number.parseInt(pair, 16));

export const generateSalt = (): string => toHex(crypto.getRandomValues(new Uint8Array(SALT_BYTES)));

export const hashPassword = async (password: string, salt: string): Promise<string> => {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: fromHex(salt), iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    key,
    DERIVED_KEY_BITS,
  );
  return toHex(new Uint8Array(bits));
};

export const verifyPassword = async (
  password: string,
  salt: string,
  expectedHash: string,
): Promise<boolean> => {
  const actual = fromHex(await hashPassword(password, salt));
  const expected = fromHex(expectedHash);
  if (actual.byteLength !== expected.byteLength) {
    return false;
  }
  return crypto.subtle.timingSafeEqual(actual, expected);
};
