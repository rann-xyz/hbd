-- ============================================================
--  Wish Journal — PostgreSQL schema for Supabase
--  Run this once in the Supabase SQL editor, then put the project
--  URL and the ANON key in .env.local (never the service_role key).
--
--  Already set up an earlier version? Run the migration at the
--  bottom of this file instead of the whole thing.
--
--  Privacy model
--  -------------
--  A wish belongs to the device that wrote it. The browser keeps a
--  random 32-byte secret in local storage, sends only its SHA-256
--  hash in the `x-wish-token-hash` request header, and every policy
--  below compares that hash with the row's owner_token_hash.
--  Consequences, on purpose:
--    • nobody can read a wish without the exact device secret,
--      including the site owner with the anon key;
--    • there is no "read all" policy, so a leaked anon key exposes
--      no wishes at all;
--    • the service_role key is never used by the site and must never
--      be shipped to a browser.
-- ============================================================

create extension if not exists pgcrypto;

create table if not exists public.wishes (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz not null default now(),
  title             text not null,
  description       text not null,
  owner_token_hash  text not null,

  constraint wishes_title_length       check (char_length(title) between 2 and 80),
  constraint wishes_description_length check (char_length(description) between 4 and 600),
  constraint wishes_token_is_a_hash    check (owner_token_hash ~ '^[0-9a-f]{64}$')
);

comment on column public.wishes.owner_token_hash is
  'SHA-256 of the writing device''s private token. Never the raw token.';

create index if not exists wishes_owner_created_idx
  on public.wishes (owner_token_hash, created_at desc);

-- ------------------------------------------------------------
--  Row Level Security
-- ------------------------------------------------------------

alter table public.wishes enable row level security;
alter table public.wishes force row level security;

-- The token hash travels in a request header; PostgREST exposes the
-- headers as a JSON GUC. Missing header => empty string => no match.
create or replace function public.wish_owner_token()
returns text
language sql
stable
as $$
  select coalesce(
    (current_setting('request.headers', true)::json ->> 'x-wish-token-hash'),
    ''
  );
$$;

drop policy if exists "wishes: insert own" on public.wishes;
create policy "wishes: insert own"
  on public.wishes
  for insert
  to anon, authenticated
  with check (
    owner_token_hash = public.wish_owner_token()
    and public.wish_owner_token() <> ''
  );

drop policy if exists "wishes: read own" on public.wishes;
create policy "wishes: read own"
  on public.wishes
  for select
  to anon, authenticated
  using (
    owner_token_hash = public.wish_owner_token()
    and public.wish_owner_token() <> ''
  );

drop policy if exists "wishes: update own" on public.wishes;
create policy "wishes: update own"
  on public.wishes
  for update
  to anon, authenticated
  using (owner_token_hash = public.wish_owner_token() and public.wish_owner_token() <> '')
  with check (owner_token_hash = public.wish_owner_token() and public.wish_owner_token() <> '');

drop policy if exists "wishes: delete own" on public.wishes;
create policy "wishes: delete own"
  on public.wishes
  for delete
  to anon, authenticated
  using (owner_token_hash = public.wish_owner_token() and public.wish_owner_token() <> '');

-- Table access is granted, but RLS still decides every single row.
revoke all on public.wishes from anon, authenticated;
grant select, insert, update, delete on public.wishes to anon, authenticated;

-- No sequential-scan helper for other roles: only the project owner can see the table.
revoke all on public.wishes from public;

-- ------------------------------------------------------------
--  Sanity check (run after the policies, should return 0 rows)
--  select * from public.wishes;
--  -> anon sees nothing without the matching device token header.
-- ------------------------------------------------------------

-- ------------------------------------------------------------
--  MIGRATION — only if you already ran an earlier version
--  The wish form no longer asks for a category, so the column and
--  its CHECK constraint go away. Existing rows keep their title and
--  description; the site reads only those two fields.
-- ------------------------------------------------------------
-- alter table public.wishes drop constraint if exists wishes_category_known;
-- alter table public.wishes drop column if exists category;
