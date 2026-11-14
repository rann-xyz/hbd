/* ============================================================
   STORAGE — where wishes actually live.
   Two real backends behind one interface:
     • cloud  : Supabase Postgres, reached with the anon key only,
                where Row Level Security checks a per-device secret
                so nobody (me included) can read someone else's wishes.
     • device : private on-device storage, used when no database is
                configured. Same interface, same validation.
   ============================================================ */

import { WISH_LIMITS, sortWishes, toWish, type Wish, type WishInput } from './wishes';

export const TOKEN_STORAGE_KEY = 'hbd-fitria.wish-token.v1';
export const DEVICE_WISHES_KEY = 'hbd-fitria.wishes.device.v1';
export const TOKEN_HEADER = 'x-wish-token-hash';

/** The slice of the Web Storage API we depend on (so tests can inject a fake). */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface WishStore {
  readonly kind: 'cloud' | 'device';
  list(): Promise<Wish[]>;
  create(input: WishInput): Promise<Wish>;
  remove(id: string): Promise<void>;
}

export class WishStoreError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'WishStoreError';
  }
}

function memoryStorage(): StorageLike {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  };
}

export function resolveStorage(injected?: StorageLike): StorageLike {
  if (injected) return injected;
  if (typeof localStorage !== 'undefined') return localStorage;
  return memoryStorage();
}

function randomHex(bytes: number): string {
  const buffer = new Uint8Array(bytes);
  const webCrypto = typeof globalThis.crypto !== 'undefined' ? globalThis.crypto : undefined;
  if (webCrypto?.getRandomValues) {
    webCrypto.getRandomValues(buffer);
  } else {
    for (let index = 0; index < buffer.length; index += 1) {
      buffer[index] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(buffer, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * The per-device secret. It never leaves this browser except as a
 * SHA-256 hash, which is what the database policy matches against.
 */
export function getOrCreateToken(storage: StorageLike): string {
  const existing = storage.getItem(TOKEN_STORAGE_KEY);
  if (existing && existing.length >= 32) return existing;
  const token = randomHex(32);
  storage.setItem(TOKEN_STORAGE_KEY, token);
  return token;
}

export function hasSubtleCrypto(): boolean {
  return typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.subtle !== 'undefined';
}

export async function hashToken(token: string): Promise<string> {
  if (!hasSubtleCrypto()) {
    throw new WishStoreError('This browser cannot hash securely, so wishes stay on this device.');
  }
  const encoded = new TextEncoder().encode(token);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function newId(): string {
  const webCrypto = typeof globalThis.crypto !== 'undefined' ? globalThis.crypto : undefined;
  if (webCrypto && typeof webCrypto.randomUUID === 'function') return webCrypto.randomUUID();
  return `wish-${Date.now().toString(36)}-${randomHex(6)}`;
}

/* ---------------------------- device store ---------------------------- */

interface DeviceRecord {
  id: string;
  createdAt: string;
  title: string;
  description: string;
  category: string;
}

export function readDeviceRecords(storage: StorageLike): DeviceRecord[] {
  const raw = storage.getItem(DEVICE_WISHES_KEY);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((row): row is DeviceRecord => typeof row === 'object' && row !== null);
  } catch {
    // Corrupted storage must never break the page: start clean instead.
    return [];
  }
}

function writeDeviceRecords(storage: StorageLike, records: readonly DeviceRecord[]): void {
  storage.setItem(DEVICE_WISHES_KEY, JSON.stringify(records.slice(-WISH_LIMITS.maxWishesPerDevice)));
}

export function createDeviceStore(storage: StorageLike = resolveStorage()): WishStore {
  const readWishes = (): Wish[] =>
    sortWishes(
      readDeviceRecords(storage)
        .map((record) => toWish(record, 'device'))
        .filter((wish): wish is Wish => wish !== null),
    );

  return {
    kind: 'device',
    async list() {
      return readWishes();
    },
    async create(input: WishInput) {
      const record: DeviceRecord = {
        id: newId(),
        createdAt: new Date().toISOString(),
        title: input.title,
        description: input.description,
        category: input.category,
      };
      const records = readDeviceRecords(storage);
      records.push(record);
      writeDeviceRecords(storage, records);
      const wish = toWish(record, 'device');
      if (!wish) throw new WishStoreError('That wish could not be stored.');
      return wish;
    },
    async remove(id: string) {
      const records = readDeviceRecords(storage).filter((record) => record.id !== id);
      writeDeviceRecords(storage, records);
    },
  };
}
