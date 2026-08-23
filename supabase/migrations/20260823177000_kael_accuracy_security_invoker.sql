begin;

alter view public.kael_estimate_accuracy set (security_invoker = true);

comment on view public.kael_estimate_accuracy is
  'Aggregate estimate-accuracy evidence over real jobs only; executes with invoker permissions so RLS is never bypassed by the view owner.';

commit;
