// Encrypts the public JSON files with the school's access code (ACCESS_CODE), so that someone who
// only has the data URL sees ciphertext. Runs in the browser and on the server (Web Crypto).
//
// Envelope stored in R2: {"kp":1,"iv":"<base64>","ct":"<base64>"}

const SALT = new TextEncoder().encode('kp-arena/2026');
const ITERATIONS = 150_000;

export interface Sealed {
  kp: 1;
  iv: string;
  ct: string;
}

export const isSealed = (v: unknown): v is Sealed => typeof v === 'object' && v !== null && (v as Sealed).kp === 1 && typeof (v as Sealed).ct === 'string';

/** Codes are typed on phones: ignore case and surrounding spaces. */
export const normalizeCode = (code: string) => code.trim().toLowerCase();

export async function keyFromCode(code: string): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(normalizeCode(code)), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: SALT, iterations: ITERATIONS, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function seal(json: string, key: CryptoKey): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(json)));
  return JSON.stringify({ kp: 1, iv: toB64(iv), ct: toB64(ct) } satisfies Sealed);
}

/** Throws if the key is wrong (AES-GCM authentication fails). */
export async function unseal(env: Sealed, key: CryptoKey): Promise<string> {
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(env.iv) }, key, fromB64(env.ct));
  return new TextDecoder().decode(plain);
}

function toB64(bytes: Uint8Array): string {
  let s = '';
  // chunked: String.fromCharCode(...big array) overflows the call stack
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function fromB64(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
