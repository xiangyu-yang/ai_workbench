const ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz';

/** 时间有序、URL 安全的短 ID：前缀 + 10 位时间 + 8 位随机（≈ 48 bit 熵） */
export function newId(prefix: string): string {
  const now = Date.now();
  let time = '';
  let t = now;
  for (let i = 0; i < 10; i++) {
    time = ALPHABET[t % 32] + time;
    t = Math.floor(t / 32);
  }
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let rand = '';
  for (let i = 0; i < 8; i++) rand += ALPHABET[bytes[i] % 32];
  return `${prefix}_${time}${rand}`;
}

export function slugify(input: string, fallback = 'item'): string {
  const slug = input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return slug || fallback;
}

/** 生成人类可读的短标识（用于公开前缀展示） */
export function shortToken(len = 8): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ALPHABET[b % 32]).join('');
}
