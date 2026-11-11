# Database migrations

Every change to the Supabase database lives in `supabase/migrations/`, named
`YYYYMMDDHHMMSS_description.sql` so they sort in the order they were applied.

The files up to `20260807145435_reassign_soroh_green.sql` were run by hand in
the Supabase SQL Editor during July–August 2026 (before the Convention). They
were moved here unchanged from the project root; their timestamps are the dates
they were first committed. `20260713222159_baseline_schema.sql` is the original
`schema.sql`.

## How to apply a new migration

1. Open Supabase Dashboard → SQL Editor → New query.
2. Paste the whole file and run it.
3. Run the "check the result" query at the bottom of the file, if there is one.

New migrations should be safe to re-run (`IF NOT EXISTS`, `CREATE OR REPLACE`,
`DROP ... IF EXISTS` before `CREATE`).

## Pending

| File | Status |
| --- | --- |
| `20261111120000_multi_event_foundation.sql` | **Not yet applied.** Adds event lifecycle and current-event flag, fixes profile privilege escalation, removes hard-coded Stores UUID from policies. |

## Events: the "current event"

Exactly one row in `events` has `is_current = true`. The app reads that row
(see `src/lib/events/current-event.ts`) for everything a user sees and submits.
To move the platform onto a new event (e.g. Congress 2026):

```sql
select public.set_current_event('<new event id>');
```

Lifecycle `status`: `planning` → `requisition_open` → `live` → `closed` → `archived`.
