import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { closed, bad } from './campaignRestoreContracts.mjs';
export function seal(key, bytes, aad) {
  const iv = randomBytes(12),
    cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(JSON.stringify(aad)));
  const data = Buffer.concat([cipher.update(bytes), cipher.final()]);
  return {
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: data.toString('base64'),
  };
}
export function open(key, v, aad, max) {
  try {
    closed(v, ['iv', 'tag', 'data']);
    const read = (s, n, exact = false) => {
      if (typeof s !== 'string' || s.length > 4 * Math.ceil(n / 3)) bad();
      const b = Buffer.from(s, 'base64');
      if (b.toString('base64') !== s || b.length > n || (exact && b.length !== n)) bad();
      return b;
    };
    const iv = read(v.iv, 12, true),
      tag = read(v.tag, 16, true),
      data = read(v.data, max);
    const cipher = createDecipheriv('aes-256-gcm', key, iv);
    cipher.setAuthTag(tag);
    cipher.setAAD(Buffer.from(JSON.stringify(aad)));
    return Buffer.concat([cipher.update(data), cipher.final()]);
  } catch {
    bad();
  }
}
