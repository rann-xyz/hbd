import { afterEach, describe, expect, it, vi } from 'vitest';

import { JOURNAL } from '../content';
import { TOKEN_STORAGE_KEY, WishStoreError, type StorageLike } from '../lib/storage';
import { resolveWishStore } from '../lib/wishStore';
import type { SupabaseClient } from '@supabase/supabase-js';

function fakeStorage(): StorageLike & { dump(): Record<string, string> } {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
    dump: () => Object.fromEntries(map),
  };
}

/** A stand-in for supabase-js that records the calls made and returns fixed rows. */
function fakeClient(rows: Record<string, unknown>[] = []): {
  client: SupabaseClient;
  inserted: Record<string, unknown>[];
  deleted: string[];
} {
  const inserted: Record<string, unknown>[] = [];
  const deleted: string[] = [];

  const builder = {
    select: () => builder,
    order: () => builder,
    limit: async () => ({ data: rows, error: null }),
    insert: (row: Record<string, unknown>) => {
      inserted.push(row);
      return builder;
    },
    delete: () => builder,
    eq: async (_column: string, value: string) => {
      deleted.push(value);
      return { error: null };
    },
    single: async () => ({
      data: {
        id: 'cloud-1',
        created_at: '2026-03-03T00:00:00.000Z',
        ...inserted[0],
      },
      error: null,
    }),
  };

  return { client: { from: () => builder } as unknown as SupabaseClient, inserted, deleted };
}

const ANON_KEY = `${Buffer.from('{"alg":"HS256"}').toString('base64url')}.${Buffer.from(
  JSON.stringify({ role: 'anon' }),
).toString('base64url')}.sig`;

const CLOUD_ENV = {
  VITE_SUPABASE_URL: 'https://abcdefghijklm.supabase.co',
  VITE_SUPABASE_ANON_KEY: ANON_KEY,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('resolveWishStore', () => {
  it('falls back to device storage when nothing is configured', async () => {
    const resolved = await resolveWishStore({ env: {}, storage: fakeStorage() });
    expect(resolved.kind).toBe('device');
    expect(resolved.notice).toBe(JOURNAL.deviceNotice);
    expect(resolved.countLabel).toBe(JOURNAL.localCountLabel);
    expect(resolved.countLabelOne).toBe(JOURNAL.localCountLabelOne);
    await expect(resolved.store.list()).resolves.toEqual([]);
  });

  it('uses the database when Supabase is configured and the browser can hash', async () => {
    const storage = fakeStorage();
    const { client } = fakeClient();

    const resolved = await resolveWishStore({
      env: CLOUD_ENV,
      storage,
      clientFactory: async () => client,
    });

    expect(resolved.kind).toBe('cloud');
    expect(resolved.notice).toBe(JOURNAL.cloudNotice);
    expect(resolved.countLabel).toBe(JOURNAL.cloudCountLabel);
    expect(resolved.countLabelOne).toBe(JOURNAL.cloudCountLabelOne);
    expect(storage.getItem(TOKEN_STORAGE_KEY)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('hands the database a SHA-256 hash of the device token, never the token', async () => {
    const storage = fakeStorage();
    const seen: string[] = [];

    await resolveWishStore({
      env: CLOUD_ENV,
      storage,
      clientFactory: async (_config, tokenHash) => {
        seen.push(tokenHash);
        return fakeClient().client;
      },
    });

    const token = storage.getItem(TOKEN_STORAGE_KEY);
    expect(token).not.toBeNull();
    expect(seen[0]).toMatch(/^[0-9a-f]{64}$/);
    expect(seen[0]).not.toBe(token);
  });

  it('keeps the same device identity across calls', async () => {
    const storage = fakeStorage();
    const hashes: string[] = [];
    const factory = async (_config: unknown, tokenHash: string): Promise<SupabaseClient> => {
      hashes.push(tokenHash);
      return fakeClient().client;
    };

    await resolveWishStore({ env: CLOUD_ENV, storage, clientFactory: factory });
    await resolveWishStore({ env: CLOUD_ENV, storage, clientFactory: factory });

    expect(hashes[0]).toBe(hashes[1]);
  });

  it('stays on device storage when the browser cannot hash securely', async () => {
    vi.stubGlobal('crypto', {});
    const resolved = await resolveWishStore({ env: CLOUD_ENV, storage: fakeStorage() });
    expect(resolved.kind).toBe('device');
  });

  it('refuses to build a cloud store from a service-role key', async () => {
    const serviceKey = `${Buffer.from('{"alg":"HS256"}').toString('base64url')}.${Buffer.from(
      JSON.stringify({ role: 'service_role' }),
    ).toString('base64url')}.sig`;

    await expect(
      resolveWishStore({
        env: { VITE_SUPABASE_URL: 'https://abcdefghijklm.supabase.co', VITE_SUPABASE_ANON_KEY: serviceKey },
        storage: fakeStorage(),
      }),
    ).rejects.toBeInstanceOf(WishStoreError);
  });

  it('gives back a store that really creates and lists cloud wishes', async () => {
    const { client, inserted } = fakeClient();
    const resolved = await resolveWishStore({
      env: CLOUD_ENV,
      storage: fakeStorage(),
      clientFactory: async () => client,
    });

    const created = await resolved.store.create({
      title: 'A quiet room',
      description: 'With a window and a plant.',
      category: 'dream',
    });

    expect(created.source).toBe('cloud');
    expect(inserted[0]?.['title']).toBe('A quiet room');
    // The row is stamped with the owner hash so RLS can match it later.
    expect(inserted[0]?.['owner_token_hash']).toMatch(/^[0-9a-f]{64}$/);
    await expect(resolved.store.list()).resolves.toEqual([]);
  });

  it('deletes only through the store, by id', async () => {
    const { client, deleted } = fakeClient();
    const resolved = await resolveWishStore({
      env: CLOUD_ENV,
      storage: fakeStorage(),
      clientFactory: async () => client,
    });

    await resolved.store.remove('wish-9');
    expect(deleted).toEqual(['wish-9']);
  });
});
