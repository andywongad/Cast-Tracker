-- Cross-device sync for shows and cast records.
--
-- The model is per-record last-write-wins, chosen over whole-library last-write-wins because the
-- latter silently destroys an edit made on the device that syncs first. It is the same shape Figma
-- uses — conflicts resolved per object rather than per document — one notch coarser, at the record
-- rather than the field, because the realistic conflict here is "I edited this character on my
-- phone", not "we both touched the nickname at once".
--
-- Only records the user has actually typed into are synced. Auto-loaded cast regenerates from TMDb
-- on any device, so uploading it would be replicating a cache.

-- Two clocks, deliberately. They answer different questions and neither can do the other's job.
--
--   server_at  — set by the database, never by a client. This is the sync cursor: "give me
--                everything that changed since I last pulled". It has to be monotonic and
--                trustworthy, and a device with a wrong system clock must not be able to poison it.
--
--   edited_at  — set by the client, when the edit was actually made. This is what decides who wins
--                a conflict. It cannot be server arrival order, because this app is offline-first:
--                a phone that was in a tunnel all day would otherwise arrive last and clobber an
--                edit made on the laptop hours later. Figma can use pure arrival order because
--                every client is connected live; we can't.
--
-- The tradeoff is real and worth stating: `edited_at` trusts the device clock. A phone set to the
-- wrong year would win or lose every conflict. That is the lesser evil against an offline edit
-- overwriting a newer one, and it is contained — the damage is limited to that user's own records,
-- and the sync cursor stays correct regardless because it never uses this column.

create table if not exists public.sync_show (
  user_id    uuid        not null references auth.users (id) on delete cascade,
  show_id    text        not null,
  payload    jsonb       not null,
  edited_at  timestamptz not null,
  server_at  timestamptz not null default now(),
  -- A tombstone, not a delete. Without this, deleting a show on one device and then syncing a
  -- device that still has its stale copy resurrects it — the row simply reappears as an insert.
  deleted_at timestamptz,
  primary key (user_id, show_id)
);

create table if not exists public.sync_cast (
  user_id    uuid        not null references auth.users (id) on delete cascade,
  show_id    text        not null,
  record_id  text        not null,
  payload    jsonb       not null,
  edited_at  timestamptz not null,
  server_at  timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (user_id, show_id, record_id)
);

-- The pull query is always "my rows, changed since X", so that is what the index describes.
create index if not exists sync_show_pull on public.sync_show (user_id, server_at);
create index if not exists sync_cast_pull on public.sync_cast (user_id, server_at);

-- `server_at` is stamped here rather than defaulted, so it is refreshed on UPDATE too and cannot be
-- supplied by a client on either path. A DEFAULT alone would only cover INSERT, which would let an
-- updated row keep an old cursor value and go missing from every subsequent pull.
create or replace function public.stamp_server_at()
returns trigger
language plpgsql
-- SECURITY INVOKER explicitly: a DEFINER function here would run as its creator and bypass RLS,
-- and it has no need to.
security invoker
set search_path = ''
as $$
begin
  new.server_at := now();
  return new;
end;
$$;

drop trigger if exists stamp_server_at on public.sync_show;
create trigger stamp_server_at before insert or update on public.sync_show
  for each row execute function public.stamp_server_at();

drop trigger if exists stamp_server_at on public.sync_cast;
create trigger stamp_server_at before insert or update on public.sync_cast
  for each row execute function public.stamp_server_at();

-- Row Level Security -------------------------------------------------------------------------
--
-- This carries the whole access model. The browser talks to PostgREST directly with a publishable
-- key that every user has, so "can I see this row" is answered by the database and by nothing else.
-- There is no server route in front of it to be careful on our behalf.

alter table public.sync_show enable row level security;
alter table public.sync_cast enable row level security;

-- `TO authenticated` is authentication, not authorization — on its own it lets any signed-in user
-- read every other user's rows. The ownership predicate in USING is what actually restricts it.
--
-- `(select auth.uid())` rather than a bare `auth.uid()`: the subquery form is evaluated once per
-- statement instead of once per row.
--
-- UPDATE carries both USING and WITH CHECK. USING decides which rows may be updated; WITH CHECK
-- decides what they may be updated *to*. Without WITH CHECK a user could reassign user_id and hand
-- their row to someone else — or take one.
--
-- `auth.role()` is deliberately not used anywhere here: it is deprecated, and it passes for
-- anonymous sign-ins, which carry the `authenticated` Postgres role without being a real account.

create policy sync_show_select on public.sync_show
  for select to authenticated using ((select auth.uid()) = user_id);
create policy sync_show_insert on public.sync_show
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy sync_show_update on public.sync_show
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy sync_show_delete on public.sync_show
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy sync_cast_select on public.sync_cast
  for select to authenticated using ((select auth.uid()) = user_id);
create policy sync_cast_insert on public.sync_cast
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy sync_cast_update on public.sync_cast
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy sync_cast_delete on public.sync_cast
  for delete to authenticated using ((select auth.uid()) = user_id);

-- Data API access ----------------------------------------------------------------------------
--
-- Separate from RLS, and the reason a correctly-policied table can still return nothing. RLS says
-- which rows are visible once the table is reachable; this says whether it is reachable at all.
-- New tables in `public` are no longer exposed to the Data API automatically (announced April 2026,
-- default from 30 October 2026), so the grant has to be explicit.
--
-- `anon` is pointedly not granted anything. Signed-out users are a real, supported state in this
-- app — sync is optional — and they have no rows here by definition.

grant select, insert, update, delete on public.sync_show to authenticated;
grant select, insert, update, delete on public.sync_cast to authenticated;
