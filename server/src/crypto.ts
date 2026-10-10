import crypto from 'node:crypto';

const SCRYPT = { N: 32768, r: 8, p: 1, keylen: 64 };

export function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, maxmem: 128 * 1024 * 1024 }, (err, key) => {
      if (err) return reject(err);
      resolve(`scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${key.toString('base64')}`);
    });
  });
}

export function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return Promise.resolve(false);
  const [, n, r, p, saltB64, hashB64] = parts;
  const salt = Buffer.from(saltB64, 'base64');
  const expected = Buffer.from(hashB64, 'base64');
  return new Promise((resolve) => {
    crypto.scrypt(password, salt, expected.length, { N: +n, r: +r, p: +p, maxmem: 128 * 1024 * 1024 }, (err, key) => {
      if (err) return resolve(false);
      resolve(key.length === expected.length && crypto.timingSafeEqual(key, expected));
    });
  });
}

/** AES-256-GCM. Output: v1:<base64(iv|tag|ciphertext)> */
export function encryptSecret(plain: string, key: Buffer): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return 'v1:' + Buffer.concat([iv, tag, ct]).toString('base64');
}

export function decryptSecret(payload: string, key: Buffer): string {
  if (!payload.startsWith('v1:')) throw new Error('Unsupported secret format');
  const raw = Buffer.from(payload.slice(3), 'base64');
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const ct = raw.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}

export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('hex');
export const sha256Hex = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}
