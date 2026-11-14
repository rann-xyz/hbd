import { describe, expect, it } from 'vitest';

import {
  WISHES_TABLE,
  assertPublicKey,
  isSupabaseConfigured,
  readJwtRole,
  readSupabaseConfig,
} from '../lib/supabase';
import { WishStoreError } from '../lib/storage';

function jwt(payload: Record<string, unknown>): string {
  const encode = (value: unknown): string =>
    Buffer.from(JSON.stringify(value)).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(payload)}.signature`;
}

const ANON_KEY = jwt({ role: 'anon', iss: 'supabase' });
const SERVICE_KEY = jwt({ role: 'service_role', iss: 'supabase' });

describe('readJwtRole', () => {
  it('reads the role out of a JWT payload', () => {
    expect(readJwtRole(ANON_KEY)).toBe('anon');
    expect(readJwtRole(SERVICE_KEY)).toBe('service_role');
  });

  it('returns null for things that are not JWTs', () => {
    expect(readJwtRole('not-a-jwt')).toBeNull();
    expect(readJwtRole('a.b')).toBeNull();
    expect(readJwtRole('a.@@@.c')).toBeNull();
  });
});

describe('assertPublicKey', () => {
  it('accepts an anon key', () => {
    expect(() => assertPublicKey(ANON_KEY)).not.toThrow();
  });

  it('refuses a service-role key so it can never reach a browser', () => {
    expect(() => assertPublicKey(SERVICE_KEY)).toThrow(WishStoreError);
  });

  it('refuses the new secret key formats', () => {
    expect(() => assertPublicKey('sb_secret_abcdefghijklmnop')).toThrow(WishStoreError);
    expect(() => assertPublicKey('sbp_abcdefghijklmnop')).toThrow(WishStoreError);
  });
});

describe('readSupabaseConfig', () => {
  it('returns null when nothing is configured', () => {
    expect(readSupabaseConfig({})).toBeNull();
    expect(readSupabaseConfig({ VITE_SUPABASE_URL: 'https://x.supabase.co' })).toBeNull();
    expect(readSupabaseConfig({ VITE_SUPABASE_ANON_KEY: ANON_KEY })).toBeNull();
  });

  it('accepts a real supabase project URL with an anon key', () => {
    const config = readSupabaseConfig({
      VITE_SUPABASE_URL: 'https://abcdefghijklm.supabase.co',
      VITE_SUPABASE_ANON_KEY: ANON_KEY,
    });
    expect(config).toEqual({ url: 'https://abcdefghijklm.supabase.co', anonKey: ANON_KEY });
  });

  it('rejects insecure and unrelated endpoints', () => {
    expect(
      readSupabaseConfig({ VITE_SUPABASE_URL: 'http://abcdefghijklm.supabase.co', VITE_SUPABASE_ANON_KEY: ANON_KEY }),
    ).toBeNull();
    expect(readSupabaseConfig({ VITE_SUPABASE_URL: 'https://evil.example.com', VITE_SUPABASE_ANON_KEY: ANON_KEY })).toBeNull();
    expect(readSupabaseConfig({ VITE_SUPABASE_URL: 'not a url', VITE_SUPABASE_ANON_KEY: ANON_KEY })).toBeNull();
  });

  it('throws loudly if someone pastes a service key', () => {
    expect(() =>
      readSupabaseConfig({ VITE_SUPABASE_URL: 'https://abcdefghijklm.supabase.co', VITE_SUPABASE_ANON_KEY: SERVICE_KEY }),
    ).toThrow(WishStoreError);
  });

  it('reports configuration state without leaking the mistake', () => {
    expect(isSupabaseConfigured({})).toBe(false);
    expect(
      isSupabaseConfigured({ VITE_SUPABASE_URL: 'https://abcdefghijklm.supabase.co', VITE_SUPABASE_ANON_KEY: ANON_KEY }),
    ).toBe(true);
    expect(
      isSupabaseConfigured({ VITE_SUPABASE_URL: 'https://abcdefghijklm.supabase.co', VITE_SUPABASE_ANON_KEY: SERVICE_KEY }),
    ).toBe(false);
  });
});

describe('table contract', () => {
  it('points at the wishes table the SQL migration creates', () => {
    expect(WISHES_TABLE).toBe('wishes');
  });
});
