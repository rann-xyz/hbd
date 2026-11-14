/* ============================================================
   SUPABASE — the cloud backend for the Wish Journal.
   Rules enforced here:
     • only the anon (public) key is ever read, and a service-role
       key is refused outright rather than shipped to a browser;
     • every request carries a per-device token hash, which is what
       the Row Level Security policies match on, so wishes stay
       private to the person who wrote them;
     • if no credentials are configured, this module reports that
       honestly and the app falls back to private device storage.
   ============================================================ */

import type { SupabaseClient } from '@supabase/supabase-js';
import { TOKEN_HEADER, WishStoreError, type WishStore } from './storage';
import { sortWishes, toWish, type Wish, type WishInput } from './wishes';

export const WISHES_TABLE = 'wishes';

export interface SupabaseConfig {
  readonly url: string;
  readonly anonKey: string;
}

export type EnvLike = Record<string, string | undefined>;

function readEnv(): EnvLike {
  const env = (import.meta as unknown as { env?: EnvLike }).env;
  return env ?? {};
}

/** Decode a JWT payload without verifying it — used only to detect a service key. */
export function readJwtRole(token: string): string | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const payload = parts[1];
  if (!payload) return null;
  try {
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    const decoded =
      typeof atob === 'function'
        ? atob(padded)
        : Buffer.from(padded, 'base64').toString('binary');
    const parsed: unknown = JSON.parse(decoded);
    if (typeof parsed === 'object' && parsed !== null && 'role' in parsed) {
      const role = (parsed as { role?: unknown }).role;
      return typeof role === 'string' ? role : null;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Guard rail: a service-role key must never reach the browser bundle.
 * Throws so the mistake is loud instead of quietly shipping.
 */
export function assertPublicKey(anonKey: string): void {
  const trimmed = anonKey.trim();
  if (trimmed.startsWith('sb_secret') || trimmed.startsWith('sbp_')) {
    throw new WishStoreError('That looks like a secret key. Use the anon/public key only.');
  }
  const role = readJwtRole(trimmed);
  if (role === 'service_role') {
    throw new WishStoreError('Refusing a service_role key — the browser must only hold the anon key.');
  }
}

export function readSupabaseConfig(env: EnvLike = readEnv()): SupabaseConfig | null {
  const url = (env['VITE_SUPABASE_URL'] ?? '').trim();
  const anonKey = (env['VITE_SUPABASE_ANON_KEY'] ?? '').trim();
  if (!url || !anonKey) return null;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  if (parsed.protocol !== 'https:') return null;
  if (!parsed.hostname.endsWith('.supabase.co') && parsed.hostname !== 'localhost') return null;

  assertPublicKey(anonKey);
  return { url, anonKey };
}

export function isSupabaseConfigured(env: EnvLike = readEnv()): boolean {
  try {
    return readSupabaseConfig(env) !== null;
  } catch {
    return false;
  }
}

export interface WishRow {
  id: string;
  title: string;
  description: string;
  category: string;
  created_at: string;
}

/** Column list we actually read — nothing more is pulled from the table. */
export const WISH_COLUMNS = 'id,title,description,category,created_at';

export async function createSupabaseClient(
  config: SupabaseConfig,
  tokenHash: string,
): Promise<SupabaseClient> {
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(config.url, config.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { [TOKEN_HEADER]: tokenHash } },
  });
}

export function createCloudStore(client: SupabaseClient, tokenHash: string): WishStore {
  const table = client.from(WISHES_TABLE);

  return {
    kind: 'cloud',
    async list(): Promise<Wish[]> {
      const { data, error } = await table
        .select(WISH_COLUMNS)
        .order('created_at', { ascending: false })
        .limit(200);

      if (error) throw new WishStoreError('Could not load wishes from your database.', error);
      const rows = (data ?? []) as unknown as WishRow[];
      return sortWishes(rows.map((row) => toWish(row, 'cloud')).filter((wish): wish is Wish => wish !== null));
    },

    async create(input: WishInput): Promise<Wish> {
      const { data, error } = await table
        .insert({
          title: input.title,
          description: input.description,
          category: input.category,
          owner_token_hash: tokenHash,
        })
        .select(WISH_COLUMNS)
        .single();

      if (error) throw new WishStoreError('That wish did not save to your database.', error);
      const wish = toWish(data as unknown as WishRow, 'cloud');
      if (!wish) throw new WishStoreError('The database returned an unexpected record.');
      return wish;
    },

    async remove(id: string): Promise<void> {
      const { error } = await table.delete().eq('id', id);
      if (error) throw new WishStoreError('That wish could not be deleted.', error);
    },
  };
}
