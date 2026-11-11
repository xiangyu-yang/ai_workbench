import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt) as (
  password: string,
  salt: string,
  keylen: number,
  options: crypto.ScryptOptions,
) => Promise<Buffer>;

const N = 16384;
const R = 8;
const P = 1;
const KEYLEN = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString('base64url');
  const derived = await scrypt(password, salt, KEYLEN, { N, r: R, p: P, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${N}$${R}$${P}$${salt}$${derived.toString('base64url')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const [algo, n, r, p, salt, hash] = stored.split('$');
    if (algo !== 'scrypt') return false;
    const expected = Buffer.from(hash, 'base64url');
    const derived = await scrypt(password, salt, expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
      maxmem: 64 * 1024 * 1024,
    });
    return expected.length === derived.length && crypto.timingSafeEqual(expected, derived);
  } catch {
    return false;
  }
}

export function validatePassword(password: string): string | null {
  if (!password || password.length < 8) return '密码至少 8 位';
  if (password.length > 200) return '密码过长';
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) return '密码需同时包含字母与数字';
  return null;
}

export function validateEmail(email: string): string | null {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return '邮箱格式不正确';
  if (email.length > 200) return '邮箱过长';
  return null;
}
