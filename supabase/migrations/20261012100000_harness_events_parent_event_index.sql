-- harness_events.parent_event_id is a self-referencing foreign key. Without an index, every
-- delete of a parent row scans the whole table to prove no child points at it, which made the
-- nightly read-telemetry retention exceed its statement timeout.
create index if not exists harness_events_parent_event_idx
  on public.harness_events (parent_event_id)
  where parent_event_id is not null;
