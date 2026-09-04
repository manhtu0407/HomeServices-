begin;

alter function public.verify_synthetic_matching_cohort_isolation(text) volatile;

comment on function public.verify_synthetic_matching_cohort_isolation(text) is
  'Returns aggregate-only Production smoke isolation evidence from a fresh post-mutation snapshot; no profile or workflow identifiers are exposed.';

commit;
