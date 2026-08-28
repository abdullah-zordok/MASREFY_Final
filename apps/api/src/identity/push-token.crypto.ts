import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

export type PushProvider = 'expo' | 'apns' | 'fcm';
export interface PushAad {
  provider: PushProvider;
  userId: string;
  deviceId: string;
}

interface EncryptionKey {
  id: string;
  key: Uint8Array;
}

function failure(): Error {
  return new Error('PUSH_CRYPTO_INVALID');
}

export class PushTokenCrypto {
  private readonly hashKey: Buffer;
  private readonly keys: ReadonlyMap<string, Buffer>;
  private readonly activeId: string;

  constructor(hashKey: Uint8Array, keyRing: readonly EncryptionKey[]) {
    const ids = new Set<string>();
    const values: Buffer[] = [];
    if (hashKey.byteLength !== 32 || keyRing.length < 1 || keyRing.length > 3) {
      throw new Error('PUSH_CRYPTO_CONFIG_INVALID');
    }
    const entries = keyRing.map(({ id, key }) => {
      const value = Buffer.from(key);
      if (!/^[A-Za-z0-9_-]{1,32}$/.test(id) || ids.has(id) || value.length !== 32) {
        throw new Error('PUSH_CRYPTO_CONFIG_INVALID');
      }
      if (values.some((existing) => timingSafeEqual(existing, value))) {
        throw new Error('PUSH_CRYPTO_CONFIG_INVALID');
      }
      ids.add(id);
      values.push(value);
      return [id, value] as const;
    });
    this.hashKey = Buffer.from(hashKey);
    this.keys = new Map(entries);
    const active = entries[0];
    if (!active) throw new Error('PUSH_CRYPTO_CONFIG_INVALID');
    this.activeId = active[0];
  }

  fingerprint(value: string): string {
    const normalized = value.trim();
    if (normalized.length < 1 || normalized.length > 512) throw failure();
    return this.hmac('fingerprint', normalized);
  }

  tokenHash(value: string): string {
    if (value.length < 1 || value.length > 4096) throw failure();
    return this.hmac('push-token', value);
  }

  encrypt(value: string, aad: PushAad): string {
    if (value.length < 1 || value.length > 4096) throw failure();
    const key = this.keys.get(this.activeId);
    if (!key) throw failure();
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(this.aad(aad));
    const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return ['v1', this.activeId, iv.toString('base64url'), tag.toString('base64url'), ciphertext.toString('base64url')].join('.');
  }

  decrypt(envelope: string, aad: PushAad): string {
    try {
      const [version, keyId, encodedIv, encodedTag, encodedCiphertext, extra] = envelope.split('.');
      if (version !== 'v1' || !keyId || !encodedIv || !encodedTag || !encodedCiphertext || extra) {
        throw failure();
      }
      const key = this.keys.get(keyId);
      if (!key) throw failure();
      const iv = Buffer.from(encodedIv, 'base64url');
      const tag = Buffer.from(encodedTag, 'base64url');
      const ciphertext = Buffer.from(encodedCiphertext, 'base64url');
      if (iv.length !== 12 || tag.length !== 16 || ciphertext.length < 1) throw failure();
      const decipher = createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAAD(this.aad(aad));
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    } catch {
      throw failure();
    }
  }

  private hmac(domain: string, value: string): string {
    return `h1:${createHmac('sha256', this.hashKey).update(`${domain}\0${value}`).digest('hex')}`;
  }

  private aad(value: PushAad): Buffer {
    return Buffer.from(`${value.provider}\0${value.userId}\0${value.deviceId}`, 'utf8');
  }
}
