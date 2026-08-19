-- Take back the privileges Supabase hands out by default.
--
-- The previous migration granted select/insert/update/delete to `authenticated` and deliberately
-- gave `anon` nothing. Auditing the result showed both roles holding
-- DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE — because Supabase ships
-- ALTER DEFAULT PRIVILEGES that grants every new table in `public` to `anon` and `authenticated`.
-- Granting explicitly does not opt out of that; only revoking does.
--
-- Row Level Security still stands in front of the row-level operations: no policy matches `anon`,
-- so every select, insert, update and delete it attempts is denied. This is not repairing a hole.
-- It matters because two of those privileges are not row-level operations at all:
--
--   TRUNCATE   is not subject to RLS. A role holding it can empty the table — every user's rows,
--              not just its own — and no policy would object. PostgREST exposes no way to call it
--              today, so nothing can reach it; that is a property of the current API surface, not
--              of our access model, and it is the wrong thing to depend on.
--
--   REFERENCES lets a role point a foreign key at these tables, which can be used to probe for the
--              existence of rows it cannot read.
--
-- What each role is left holding is then exactly what the app needs it to hold: `authenticated`
-- can read and write rows, RLS decides which; `anon` can do nothing, which is correct because
-- signed-out use is a supported state in this app and has no rows here by definition.

revoke all on public.sync_show from anon;
revoke all on public.sync_cast from anon;

revoke truncate, references, trigger on public.sync_show from authenticated;
revoke truncate, references, trigger on public.sync_cast from authenticated;
