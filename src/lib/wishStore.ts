/* ============================================================
   WISH STORE RESOLUTION — decides, honestly and once, where a wish
   is kept:
     • Supabase configured + browser can hash  -> Postgres, with the
       per-device token hash sent as a request header and enforced by
       Row Level Security;
     • anything missing                        -> private on-device
       storage, and the UI says so instead of pretending.
   ============================================================ */

import { JOURNAL } from '../content';
import {
  createDeviceStore,
  getOrCreateToken,
  hashToken,
  hasSubtleCrypto,
  resolveStorage,
  type StorageLike,
  type WishStore,
} from './storage';
import {
  createCloudStore,
  createSupabaseClient,
  readSupabaseConfig,
  type EnvLike,
  type SupabaseConfig,
} from './supabase';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface ResolvedStore {
  readonly store: WishStore;
  readonly kind: WishStore['kind'];
  /** Copy shown to the visitor, so privacy is never implied by accident. */
  readonly notice: string;
  readonly countLabel: string;
  /** Singular form, used when exactly one wish is kept. */
  readonly countLabelOne: string;
}

export interface ResolveDeps {
  readonly storage?: StorageLike;
  readonly env?: EnvLike;
  readonly clientFactory?: (config: SupabaseConfig, tokenHash: string) => Promise<SupabaseClient>;
}

export async function resolveWishStore(deps: ResolveDeps = {}): Promise<ResolvedStore> {
  const storage = deps.storage ?? resolveStorage();

  // readSupabaseConfig throws when the environment holds a secret/service key.
  // That mistake must be loud — quietly downgrading to device storage would
  // hide a key that must never be shipped to a browser. Invalid or missing
  // values simply return null, which is the normal "no database" path.
  const config = deps.env ? readSupabaseConfig(deps.env) : readSupabaseConfig();

  if (config && hasSubtleCrypto()) {
    const tokenHash = await hashToken(getOrCreateToken(storage));
    const createClient = deps.clientFactory ?? createSupabaseClient;
    const client = await createClient(config, tokenHash);
    return {
      store: createCloudStore(client, tokenHash),
      kind: 'cloud',
      notice: JOURNAL.cloudNotice,
      countLabel: JOURNAL.cloudCountLabel,
      countLabelOne: JOURNAL.cloudCountLabelOne,
    };
  }

  return {
    store: createDeviceStore(storage),
    kind: 'device',
    notice: JOURNAL.deviceNotice,
    countLabel: JOURNAL.localCountLabel,
    countLabelOne: JOURNAL.localCountLabelOne,
  };
}
