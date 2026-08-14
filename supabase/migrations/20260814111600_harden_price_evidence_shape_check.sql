-- SQL CHECK constraints accept NULL, so make the complete evidence-shape
-- predicate explicitly boolean before it can authorize stored price evidence.
begin;

alter table public.price_baselines
  drop constraint if exists price_baselines_price_evidence_shape_check;

alter table public.price_baselines
  add constraint price_baselines_price_evidence_shape_check check ((
    jsonb_typeof(price_evidence) = 'object'
    and price_evidence ->> 'schema_version' = 'baseline_price_evidence.v1'
    and jsonb_typeof(price_evidence -> 'sources') = 'array'
  ) is true);

commit;
