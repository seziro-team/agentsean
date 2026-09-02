-- Make a half-processed webhook repairable.
--
-- The webhook route records the event in billing_events for idempotency and
-- then applies it. Those are two steps, and the ledger row was the only record
-- either had happened — there was no way to tell "recorded and applied" from
-- "recorded, then the apply failed".
--
-- That gap lost money. If the apply failed, the route answered 200 so the
-- provider would not retry; and had it retried, the ledger insert would have
-- hit the unique constraint and returned "duplicate, already handled" without
-- ever applying. The customer paid, the plan was never set, and nothing
-- recorded the failure.
--
-- applied_at closes it: null means recorded-but-not-applied, and the route
-- treats a duplicate with a null applied_at as work still to do.

alter table public.billing_events
  add column if not exists applied_at timestamptz;

comment on column public.billing_events.applied_at is
  'When the event was successfully applied. Null means recorded but not yet applied — a retry should re-apply it rather than treat it as a duplicate.';

-- Existing rows predate the column. They were written by the old path, which
-- applied immediately after inserting, so treat them as applied rather than
-- letting a future retry re-run them.
update public.billing_events
   set applied_at = received_at
 where applied_at is null;

-- Finding these is the operator's "what did we drop?" query, so index for it.
create index if not exists billing_events_unapplied_idx
    on public.billing_events (received_at)
 where applied_at is null;
