import crypto from 'node:crypto';
import { appSecret } from '@/server/env';

let cachedKey: Buffer | null = null;

function key(): Buffer {
  if (!cachedKey) cachedKey = crypto.scryptSync(appSecret(), 'cuter-kek-v1', 32);
  return cachedKey;
}

/** AES-256-GCM 加密，格式：v1.<iv>.<tag>.<ciphertext>（base64url） */
export function encryptSecret(plain: string): string {
  if (!plain) return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString('base64url')}.${tag.toString('base64url')}.${ct.toString('base64url')}`;
}

export function decryptSecret(payload: string | null | undefined): string {
  if (!payload) return '';
  const parts = payload.split('.');
  if (parts.length !== 4 || parts[0] !== 'v1') return '';
  try {
    const iv = Buffer.from(parts[1], 'base64url');
    const tag = Buffer.from(parts[2], 'base64url');
    const ct = Buffer.from(parts[3], 'base64url');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
  } catch {
    return '';
  }
}

export function maskSecret(value: string | null | undefined): string {
  if (!value) return '';
  if (value.length <= 4) return '••••';
  return `••••••••${value.slice(-4)}`;
}

export function sha256(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

export function newApiKey(): { key: string; prefix: string; hash: string } {
  const prefix = crypto.randomBytes(4).toString('hex');
  const secret = crypto.randomBytes(24).toString('base64url');
  const key = `cw_${prefix}_${secret}`;
  return { key, prefix, hash: sha256(key) };
}
