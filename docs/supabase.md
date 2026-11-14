# Wish Journal — Supabase setup

The Wish Journal works with **no backend at all**: wishes are then kept in
private on-device storage and the page says so. Follow these steps only if you
want wishes persisted in your own PostgreSQL database.

## 1. Create the project

1. Create a project at <https://supabase.com>.
2. Open **SQL Editor** and run `supabase/schema.sql` from this repository.
   It creates the `wishes` table, its constraints and the Row Level Security
   policies.

## 2. Add the two public values

Copy `.env.example` to `.env.local` and fill in only these two values, both
found under **Project Settings → API**:

```
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon / publishable key>
```

Restart the dev server (`npm run dev`) — Vite only reads env files at start-up.

## 3. What must never happen

- **Never** put the `service_role` key in a `VITE_*` variable. Everything with a
  `VITE_` prefix is bundled into JavaScript that any visitor can read.
  The client refuses such a key loudly (`assertPublicKey`), and there is a test
  for that refusal.
- Never commit `.env.local` (already in `.gitignore`).

## 4. How privacy actually works

Each browser generates a random 32-byte token, keeps it in `localStorage`, and
sends only its SHA-256 hash in the `x-wish-token-hash` header on every request.
The RLS policies compare that header with the row's `owner_token_hash`:

| action | allowed only when |
| --- | --- |
| insert | the row is stamped with this device's hash |
| select | the row's hash equals this device's hash |
| update / delete | the row's hash equals this device's hash |

There is deliberately **no** policy that lets anyone read all rows. With only
the anon key, a visitor — or the site owner — sees an empty result set. That is
the point: wishes are private by default and Agis is not assumed to have
permission to read them.

Implications worth knowing:

- Wishes are tied to a device, not an account. Clearing site data loses access
  to them (the rows stay in the database).
- Already-private data can never be "recovered" by the site owner from the
  front end. If you ever need a copy, read it from the Supabase dashboard.

## 5. Verify it really writes

1. Open the site, write a wish, press **Keep this wish**.
2. The notice under the form should read: *"Saved privately in your own
   database."*
3. In the Supabase dashboard, **Table Editor → wishes** shows the row with a
   `owner_token_hash` and no readable content for anyone else.
4. Reload the page — the wish is still listed, loaded from Postgres.

If the notice instead says *"Saved privately on this device only"*, the env
values are missing or the browser cannot hash, and the app has fallen back to
device storage (by design, never silently).
