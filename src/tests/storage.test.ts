import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  DEVICE_WISHES_KEY,
  TOKEN_STORAGE_KEY,
  WishStoreError,
  createDeviceStore,
  getOrCreateToken,
  hashToken,
  hasSubtleCrypto,
  readDeviceRecords,
  resolveStorage,
  type StorageLike,
} from '../lib/storage';

function fakeStorage(seed: Record<string, string> = {}): StorageLike & { dump(): Record<string, string> } {
  const map = new Map<string, string>(Object.entries(seed));
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
    dump: () => Object.fromEntries(map),
  };
}

const VALID_INPUT = { title: 'See the sea', description: 'Somewhere warm, with nowhere to be.' };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('resolveStorage', () => {
  it('prefers an injected storage', () => {
    const injected = fakeStorage();
    expect(resolveStorage(injected)).toBe(injected);
  });

  it('falls back to a working in-memory storage when nothing is available', () => {
    const fallback = resolveStorage();
    fallback.setItem('k', 'v');
    expect(fallback.getItem('k')).toBe('v');
    fallback.removeItem('k');
    expect(fallback.getItem('k')).toBeNull();
  });
});

describe('device token', () => {
  it('creates one strong token and keeps returning the same one', () => {
    const storage = fakeStorage();
    const first = getOrCreateToken(storage);
    const second = getOrCreateToken(storage);

    expect(first).toBe(second);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(storage.getItem(TOKEN_STORAGE_KEY)).toBe(first);
  });

  it('replaces a token that is too short to be safe', () => {
    const storage = fakeStorage({ [TOKEN_STORAGE_KEY]: 'short' });
    expect(getOrCreateToken(storage)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('hashes tokens deterministically without the raw secret ever matching the hash', async () => {
    const token = 'a'.repeat(64);
    const hash = await hashToken(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toBe(token);
    expect(await hashToken(token)).toBe(hash);
    expect(await hashToken('b'.repeat(64))).not.toBe(hash);
  });

  it('refuses to pretend it can hash when the browser cannot', async () => {
    vi.stubGlobal('crypto', {});
    expect(hasSubtleCrypto()).toBe(false);
    await expect(hashToken('token')).rejects.toBeInstanceOf(WishStoreError);
  });
});

describe('device wish store', () => {
  it('starts empty', async () => {
    const store = createDeviceStore(fakeStorage());
    expect(store.kind).toBe('device');
    await expect(store.list()).resolves.toEqual([]);
  });

  it('creates a wish that can be read back with a real timestamp', async () => {
    const storage = fakeStorage();
    const store = createDeviceStore(storage);

    const created = await store.create(VALID_INPUT);
    expect(created.id.length).toBeGreaterThan(8);
    expect(created.source).toBe('device');
    expect(Number.isNaN(new Date(created.createdAt).getTime())).toBe(false);

    const listed = await store.list();
    expect(listed).toHaveLength(1);
    expect(listed[0]?.title).toBe(VALID_INPUT.title);

    expect(storage.getItem(DEVICE_WISHES_KEY)).toContain(VALID_INPUT.title);
  });

  it('keeps multiple wishes newest first', async () => {
    const store = createDeviceStore(fakeStorage());
    await store.create({ ...VALID_INPUT, title: 'First' });
    await new Promise((resolve) => setTimeout(resolve, 5));
    await store.create({ ...VALID_INPUT, title: 'Second' });

    const listed = await store.list();
    expect(listed.map((wish) => wish.title)).toEqual(['Second', 'First']);
  });

  it('deletes only the wish that was asked for', async () => {
    const store = createDeviceStore(fakeStorage());
    const keep = await store.create({ ...VALID_INPUT, title: 'Keep' });
    const drop = await store.create({ ...VALID_INPUT, title: 'Drop' });

    await store.remove(drop.id);
    const listed = await store.list();
    expect(listed.map((wish) => wish.id)).toEqual([keep.id]);

    // Deleting something that is already gone is not an error.
    await expect(store.remove(drop.id)).resolves.toBeUndefined();
  });

  it('survives corrupted storage instead of throwing', async () => {
    const storage = fakeStorage({ [DEVICE_WISHES_KEY]: '{not json at all' });
    expect(readDeviceRecords(storage)).toEqual([]);
    await expect(createDeviceStore(storage).list()).resolves.toEqual([]);
  });

  it('reads a row written by the version that still had categories', async () => {
    // Wishes already saved on a phone carry a `category`. The field is gone
    // from the contract; those rows must keep showing up, minus the extra key.
    const storage = fakeStorage({
      [DEVICE_WISHES_KEY]: JSON.stringify([
        { id: 'legacy', createdAt: '2026-01-01T00:00:00.000Z', title: 'Older wish', description: 'Still here.', category: 'dream' },
      ]),
    });
    const listed = await createDeviceStore(storage).list();
    expect(listed).toHaveLength(1);
    expect(listed[0]?.title).toBe('Older wish');
    expect(listed[0]).not.toHaveProperty('category');
  });

  it('ignores junk rows but keeps the valid ones', async () => {
    const storage = fakeStorage({
      [DEVICE_WISHES_KEY]: JSON.stringify([
        { nonsense: true },
        null,
        { id: 'ok', createdAt: '2026-02-02T00:00:00.000Z', title: 'Fine', description: 'Yes.', category: 'dream' },
      ]),
    });

    // Raw rows are read defensively: nulls are dropped, unknown shapes are kept but never trusted.
    expect(readDeviceRecords(storage)).toHaveLength(2);

    const listed = await createDeviceStore(storage).list();
    expect(listed).toHaveLength(1);
    expect(listed[0]?.title).toBe('Fine');
  });

  it('never stores fields outside the wish contract', async () => {
    const storage = fakeStorage();
    const store = createDeviceStore(storage);
    await store.create(VALID_INPUT);
    const raw = JSON.parse(storage.getItem(DEVICE_WISHES_KEY) ?? '[]') as Record<string, unknown>[];
    expect(Object.keys(raw[0] ?? {}).sort()).toEqual(['createdAt', 'description', 'id', 'title']);
  });
});
