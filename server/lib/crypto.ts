import {
  createHash,
  createHmac,
  randomBytes,
  scrypt,
  timingSafeEqual,
  type ScryptOptions,
} from "node:crypto";

// --- Random tokens -----------------------------------------------------------

export const randomToken = (bytes = 32) =>
  randomBytes(bytes).toString("base64url");

export const sha256 = (value: string) =>
  createHash("sha256").update(value).digest("hex");

export const hmacHex = (secret: string, value: string) =>
  createHmac("sha256", secret).update(value).digest("hex");

// --- JWT (HS256), the format PostgREST verifies -------------------------------

export type JwtClaims = {
  sub?: string;
  role?: string;
  exp?: number;
  iat?: number;
  aud?: string;
  session_id?: string;
  email?: string;
  [claim: string]: unknown;
};

const encodeJson = (value: unknown) =>
  Buffer.from(JSON.stringify(value)).toString("base64url");

export const signJwt = (claims: JwtClaims, secret: string): string => {
  const header = encodeJson({ alg: "HS256", typ: "JWT" });
  const payload = encodeJson(claims);
  const signature = createHmac("sha256", secret)
    .update(`${header}.${payload}`)
    .digest("base64url");
  return `${header}.${payload}.${signature}`;
};

/** Returns the claims of a valid, unexpired token, or null. */
export const verifyJwt = (token: string, secret: string): JwtClaims | null => {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, payload, signature] = parts;
  try {
    const { alg } = JSON.parse(Buffer.from(header, "base64url").toString());
    if (alg !== "HS256") return null;
    const expected = createHmac("sha256", secret)
      .update(`${header}.${payload}`)
      .digest();
    const actual = Buffer.from(signature, "base64url");
    if (actual.length !== expected.length) return null;
    if (!timingSafeEqual(actual, expected)) return null;
    const claims = JSON.parse(
      Buffer.from(payload, "base64url").toString(),
    ) as JwtClaims;
    if (typeof claims.exp === "number" && claims.exp <= Date.now() / 1000) {
      return null;
    }
    return claims;
  } catch {
    return null;
  }
};

// --- Passwords (scrypt) ---------------------------------------------------------

const SCRYPT = { N: 32768, r: 8, p: 1, keyLength: 64 };
const SCRYPT_MAXMEM = 64 * 1024 * 1024;

const scryptAsync = (
  password: string,
  salt: Buffer,
  keyLength: number,
  options: ScryptOptions,
) =>
  new Promise<Buffer>((resolve, reject) =>
    scrypt(password, salt, keyLength, options, (error, key) =>
      error ? reject(error) : resolve(key),
    ),
  );

export const hashPassword = async (password: string): Promise<string> => {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, SCRYPT.keyLength, {
    N: SCRYPT.N,
    r: SCRYPT.r,
    p: SCRYPT.p,
    maxmem: SCRYPT_MAXMEM,
  });
  return [
    "scrypt",
    SCRYPT.N,
    SCRYPT.r,
    SCRYPT.p,
    salt.toString("base64url"),
    key.toString("base64url"),
  ].join("$");
};

// Used when the user does not exist, so both cases take the same time.
let dummyHash: Promise<string> | undefined;

export const verifyPassword = async (
  password: string,
  stored: string | null | undefined,
): Promise<boolean> => {
  if (!stored) {
    dummyHash ??= hashPassword("timing-equalizer");
    await verifyPassword(password, await dummyHash);
    return false;
  }
  const [scheme, n, r, p, salt, key] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !key) return false;
  const expected = Buffer.from(key, "base64url");
  const actual = await scryptAsync(
    password,
    Buffer.from(salt, "base64url"),
    expected.length,
    { N: Number(n), r: Number(r), p: Number(p), maxmem: SCRYPT_MAXMEM },
  );
  return timingSafeEqual(actual, expected);
};
